/**
 * WebDAV gateway for the Next.js server.
 *
 * Next.js App Router only dispatches the seven standard HTTP verbs, so WebDAV
 * methods (PROPFIND, MKCOL, MOVE, COPY, PROPPATCH, LOCK, UNLOCK) sent by
 * drive-mapping clients never reach route handlers. This tiny reverse proxy
 * sits in front of the Next server and tunnels those verbs as POST requests
 * with the original verb preserved in the X-WebDAV-Method header, which
 * app/api/dav/[[...path]]/route.ts dispatches on. All other traffic is
 * forwarded untouched.
 *
 * Runtime layout (Lambda container):
 *   Lambda Web Adapter -> dav-gateway (PORT, default 3000)
 *                          -> Next standalone server (DAV_UPSTREAM_PORT, 3001)
 *
 * The gateway spawns `node server.js` itself unless DAV_NO_SPAWN=1 is set
 * (useful locally to front an already-running `next dev`):
 *   DAV_NO_SPAWN=1 PORT=3300 DAV_UPSTREAM_PORT=3000 node dav-gateway.mjs
 *
 * No dependencies — node:http only.
 */

import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const LISTEN_PORT = Number(process.env.PORT ?? 3000);
const UPSTREAM_HOST = process.env.DAV_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.DAV_UPSTREAM_PORT ?? 3001);
const SPAWN_SERVER = process.env.DAV_NO_SPAWN !== "1";
const SERVER_ENTRY = process.env.DAV_SERVER_ENTRY ?? "server.js";

const TUNNELED_METHODS = new Set([
	"PROPFIND",
	"PROPPATCH",
	"MKCOL",
	"MOVE",
	"COPY",
	"LOCK",
	"UNLOCK",
]);

// Hop-by-hop headers must not be forwarded (RFC 7230 §6.1).
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

function forwardHeaders(raw) {
	const headers = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!HOP_BY_HOP.has(key.toLowerCase()) && value !== undefined) {
			headers[key] = value;
		}
	}
	return headers;
}

const server = http.createServer((req, res) => {
	const isDavPath = (req.url ?? "").startsWith("/api/dav");
	const tunnel = isDavPath && TUNNELED_METHODS.has(req.method ?? "");

	const headers = forwardHeaders(req.headers);
	if (tunnel) {
		headers["x-webdav-method"] = req.method;
	}

	const upstream = http.request(
		{
			host: UPSTREAM_HOST,
			port: UPSTREAM_PORT,
			path: req.url,
			method: tunnel ? "POST" : req.method,
			headers,
		},
		(upstreamRes) => {
			res.writeHead(
				upstreamRes.statusCode ?? 502,
				forwardHeaders(upstreamRes.headers),
			);
			upstreamRes.pipe(res);
		},
	);

	upstream.on("error", (error) => {
		console.error("dav-gateway upstream error:", error.message);
		if (!res.headersSent) {
			res.writeHead(502, { "Content-Type": "text/plain" });
		}
		res.end("Bad Gateway");
	});

	req.pipe(upstream);
});

function waitForUpstream(retries = 120) {
	return new Promise((resolve, reject) => {
		const attempt = (remaining) => {
			const socket = net.connect(UPSTREAM_PORT, UPSTREAM_HOST);
			socket.once("connect", () => {
				socket.destroy();
				resolve();
			});
			socket.once("error", () => {
				socket.destroy();
				if (remaining <= 0) {
					reject(new Error("Upstream Next.js server never became ready."));
					return;
				}
				setTimeout(() => attempt(remaining - 1), 250);
			});
		};
		attempt(retries);
	});
}

async function main() {
	if (SPAWN_SERVER) {
		const child = spawn("node", [SERVER_ENTRY], {
			stdio: "inherit",
			env: {
				...process.env,
				PORT: String(UPSTREAM_PORT),
				HOSTNAME: UPSTREAM_HOST,
			},
		});
		child.on("exit", (code) => {
			console.error(`Next.js server exited with code ${code}`);
			process.exit(code ?? 1);
		});
		for (const signal of ["SIGINT", "SIGTERM"]) {
			process.on(signal, () => {
				child.kill(signal);
			});
		}
	}

	await waitForUpstream();
	server.listen(LISTEN_PORT, () => {
		console.log(
			`dav-gateway listening on :${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
		);
	});
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
