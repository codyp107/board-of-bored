/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `bob-${version}`;
const ASSETS = new Set([...build, ...files]);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...ASSETS]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

// Only static build assets are cached. Pages and data always come from the server,
// so nothing private (tasks, attachments) is ever stored in the browser cache.
sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return;

	if (ASSETS.has(url.pathname)) {
		event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
		return;
	}

	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req).catch(
				() =>
					new Response(
						`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
						<body style="font-family:system-ui;padding:2rem;text-align:center;color:#334155">
						<h1>Can't reach Board of Bored</h1><p>Check that you're on your home network or connected to the VPN, then try again.</p>
						<button onclick="location.reload()" style="padding:.6rem 1.2rem;font-size:1rem">Retry</button></body>`,
						{ headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 }
					)
			)
		);
	}
});
