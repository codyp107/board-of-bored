// Production entry point. Wraps the SvelteKit Node handler so a direct LAN request
// over plain HTTP is treated as http:// (adapter-node otherwise assumes https://,
// which breaks form posts and drops the login cookie). A reverse proxy that sets
// X-Forwarded-Proto: https still wins, because PROTOCOL_HEADER points at that header.
process.env.PROTOCOL_HEADER ||= 'x-forwarded-proto';

const { handler } = await import('./build/handler.js');
const http = await import('node:http');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
	if (!req.headers['x-forwarded-proto']) req.headers['x-forwarded-proto'] = 'http';
	handler(req, res);
});

server.listen(port, host, () => console.log(`Listening on http://${host}:${port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
	process.on(sig, () => server.close(() => process.exit(0)));
}
