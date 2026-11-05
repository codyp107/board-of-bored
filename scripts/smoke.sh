#!/usr/bin/env bash
# End-to-end smoke test against a fresh, running instance (no account yet).
# Usage: scripts/smoke.sh http://127.0.0.1:3000
set -euo pipefail
B="${1:-http://127.0.0.1:3000}"
JAR=$(mktemp)
TMP=$(mktemp -d)
pass() { printf '  ok  %s\n' "$*"; }
fail() {
	printf '  FAIL %s (last HTTP status: %s)\n' "$*" "$(cat "$TMP/last.code" 2>/dev/null)"
	head -c 1500 "$TMP/last.body" 2>/dev/null || true
	echo
	exit 1
}
# SvelteKit rejects cross-site form posts, so send the Origin a browser would.
req() { curl -sS -b "$JAR" -c "$JAR" -H "Origin: $B" -H "Accept: text/html" "$@"; }
code() { local c; c=$(req -o "$TMP/last.body" -w "%{http_code}" "$@"); echo "$c" >"$TMP/last.code"; echo "$c"; }

echo "Smoke testing $B"
for _ in $(seq 1 60); do curl -fsS "$B/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$B/healthz" >/dev/null || fail "healthz"
pass "healthz"

[ "$(code "$B/w/all")" = 303 ] || fail "fresh install should redirect to setup"
pass "fresh install redirects to /setup"

[ "$(code -d 'username=tester&password=short&confirm=short' "$B/setup")" = 400 ] || fail "weak password accepted"
pass "setup rejects weak password"

[ "$(code -d 'username=tester&password=correct-horse-1&confirm=correct-horse-1' "$B/setup")" = 303 ] || fail "setup"
pass "account created"

[ "$(code "$B/setup")" = 404 ] || fail "setup page should be gone"
pass "setup page disabled afterwards"

[ "$(code -d 'title=Smoke+test+task&workspace=rise' "$B/quick-add")" = 303 ] || fail "quick add"
req "$B/w/rise" >"$TMP/board.html"
grep -q 'Smoke test task' "$TMP/board.html" || fail "task not on Rise board"
ID=$(grep -o 'href="/tasks/[0-9]*"' "$TMP/board.html" | head -1 | grep -o '[0-9]*')
[ -n "$ID" ] || fail "task id"
pass "quick add → task #$ID on Rise board"

[ "$(code -d 'title=Smoke+test+task&workspace_id=1&priority=high&status=in_progress&due_date=2020-01-01&source=Smoke+Bot&description=hello' "$B/tasks/$ID?/save")" = 200 ] || fail "save"
req "$B/w/all" | grep -q 'Overdue' || fail "overdue highlight"
pass "edit saved; shows overdue"

[ "$(code -d 'url=example.com&label=Example' "$B/tasks/$ID?/addLink")" = 200 ] || fail "add link"
printf 'hello attachment\n' >"$TMP/note.txt"
[ "$(code -F "files=@$TMP/note.txt" "$B/tasks/$ID?/upload")" = 200 ] || fail "upload"
printf 'x' >"$TMP/evil.exe"
[ "$(code -F "files=@$TMP/evil.exe" "$B/tasks/$ID?/upload")" = 400 ] || fail ".exe upload should be rejected"
req "$B/tasks/$ID" >"$TMP/task.html"
grep -q 'https://example.com/' "$TMP/task.html" || fail "link listed"
FILE=$(grep -o 'href="/files/[0-9]*"' "$TMP/task.html" | head -1 | grep -o '[0-9]*')
[ "$(req "$B/files/$FILE")" = 'hello attachment' ] || fail "download attachment"
pass "link + attachment added; bad type rejected; download works"

[ "$(code -d 'notes=Fixed+it+with+smoke' "$B/tasks/$ID?/complete")" = 200 ] || fail "complete"
req "$B/w/all/completed" | grep -q 'Fixed it with smoke' || fail "completed view"
pass "completed with notes"

req "$B/tasks/$ID" >"$TMP/task.html"
for h in 'Created' 'Priority: Normal → High' 'Marked done' 'Attached note.txt'; do
	grep -q "$h" "$TMP/task.html" || fail "history missing: $h"
done
pass "edit history recorded"

req "$B/reports?preset=this_month" | grep -q 'Fixed it with smoke' || fail "report"
req -o "$TMP/r.pdf" "$B/reports/pdf?preset=this_month"
head -c 5 "$TMP/r.pdf" | grep -q '%PDF-' || fail "pdf"
pass "report + PDF export ($(wc -c <"$TMP/r.pdf") bytes)"

[ "$(code -X POST "$B/tasks/$ID?/archive")" = 200 ] || fail "archive"
req "$B/archive" | grep -q 'Smoke test task' || fail "archive list"
req "$B/reports?preset=this_month" | grep -q 'Fixed it with smoke' && fail "archived task still in report"
[ "$(code -X POST "$B/tasks/$ID?/restore")" = 200 ] || fail "restore"
pass "archive + restore"

[ "$(code -X POST "$B/logout")" = 303 ] || fail "logout"
[ "$(code "$B/files/$FILE")" = 303 ] || fail "attachment reachable while logged out"
[ "$(code "$B/w/all")" = 303 ] || fail "board reachable while logged out"
pass "logged out: board and attachments require login"

[ "$(code -d 'username=tester&password=wrong-password' "$B/login")" = 400 ] || fail "bad login"
[ "$(code -d 'username=tester&password=correct-horse-1&remember=on' "$B/login")" = 303 ] || fail "login"
pass "login works"

echo "All smoke tests passed."
