import { NextResponse } from "next/server";

import { authenticateBasicAuth } from "@/lib/app-passwords";
import {
	assertLockPermission,
	createOrRefreshLock,
	extractSubmittedLockTokens,
	listActiveLocksForPath,
	parseTimeoutSeconds,
	unlockWithToken,
} from "@/lib/webdav-locks";
import {
	copyNode,
	createFolderInMyFiles,
	deleteNode,
	downloadNodeContent,
	findNodeByVirtualPath,
	listViewerDirectory,
	moveNode,
	uploadFileInMyFiles,
	type ViewerNode,
} from "@/lib/virtual-files";

function decodePathSegments(pathSegments?: string[]) {
	const joined = `/${(pathSegments ?? []).join("/")}`;
	return joined
		.split("/")
		.map((segment) => decodeURIComponent(segment))
		.join("/");
}

function normalizeVirtualPath(rawPath: string) {
	const parts = rawPath
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean);
	return `/${parts.join("/")}`;
}

function xmlEscape(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function davHref(virtualPath: string) {
	const encoded = virtualPath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `/api/dav${encoded}`;
}

function parseDestinationPath(destinationHeader: string | null) {
	if (!destinationHeader) {
		return null;
	}

	try {
		const destinationUrl = new URL(destinationHeader);
		const destinationPath =
			destinationUrl.pathname.replace(/^\/api\/dav/i, "") || "/";
		return decodeURIComponent(destinationPath);
	} catch {
		const pathOnly = destinationHeader.replace(/^https?:\/\/[^/]+/i, "");
		const stripped = pathOnly.replace(/^\/api\/dav/i, "") || "/";
		return decodeURIComponent(stripped);
	}
}

function parseOwnerFromBody(body: string) {
	const ownerMatch = /<owner[^>]*>([\s\S]*?)<\/owner>/i.exec(body);
	if (!ownerMatch?.[1]) {
		return null;
	}

	return ownerMatch[1]
		.replace(/<[^>]+>/g, "")
		.trim()
		.slice(0, 256);
}

function lockDiscoveryXml(
	locks: Awaited<ReturnType<typeof listActiveLocksForPath>>,
) {
	if (locks.length === 0) {
		return "<d:lockdiscovery/>";
	}

	const entries = locks
		.map(
			(lock) => `<d:activelock>
  <d:locktype><d:write/></d:locktype>
  <d:lockscope><d:exclusive/></d:lockscope>
  <d:depth>${lock.depth}</d:depth>
  <d:owner>${lock.owner ? xmlEscape(lock.owner) : ""}</d:owner>
  <d:timeout>Second-${lock.timeoutSec}</d:timeout>
  <d:locktoken><d:href>opaquelocktoken:${lock.token}</d:href></d:locktoken>
  <d:lockroot><d:href>${xmlEscape(davHref(lock.lockPath))}</d:href></d:lockroot>
</d:activelock>`,
		)
		.join("\n");

	return `<d:lockdiscovery>${entries}</d:lockdiscovery>`;
}

function renderResponseItem(
	item: ViewerNode,
	locks: Awaited<ReturnType<typeof listActiveLocksForPath>>,
) {
	const isFolder = item.kind === "folder";

	return `<d:response>
  <d:href>${xmlEscape(davHref(item.virtualPath))}</d:href>
  <d:propstat>
    <d:prop>
      <d:displayname>${xmlEscape(item.name)}</d:displayname>
      <d:resourcetype>${isFolder ? "<d:collection/>" : ""}</d:resourcetype>
      <d:getcontentlength>${isFolder ? 0 : item.sizeBytes}</d:getcontentlength>
      <d:getlastmodified>${new Date(item.updatedAt).toUTCString()}</d:getlastmodified>
      <d:supportedlock>
        <d:lockentry>
          <d:lockscope><d:exclusive/></d:lockscope>
          <d:locktype><d:write/></d:locktype>
        </d:lockentry>
      </d:supportedlock>
      ${lockDiscoveryXml(locks)}
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`;
}

function unauthorizedResponse() {
	return new NextResponse("Unauthorized", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Navara WebDAV"' },
	});
}

function lockedResponse(lockedBy?: string) {
	return new NextResponse(lockedBy ? `Locked by ${lockedBy}` : "Locked", {
		status: 423,
	});
}

function normalizeError(error: unknown) {
	const message =
		error instanceof Error ? error.message : "Internal Server Error";
	const lower = message.toLowerCase();

	if (lower.includes("not found")) {
		return new NextResponse(message, { status: 404 });
	}

	if (lower.includes("lock")) {
		return new NextResponse(message, { status: 423 });
	}

	if (
		lower.includes("bad") ||
		lower.includes("invalid") ||
		lower.includes("required")
	) {
		return new NextResponse(message, { status: 400 });
	}

	return new NextResponse(message, { status: 500 });
}

async function authFromBasic(request: Request) {
	const session = await authenticateBasicAuth(
		request.headers.get("authorization"),
	);
	return session?.userEmail ?? null;
}

async function requirePathLockPermission(params: {
	userEmail: string;
	path: string;
	request: Request;
}) {
	const check = await assertLockPermission({
		path: params.path,
		userEmail: params.userEmail,
		ifHeader: params.request.headers.get("if"),
		lockTokenHeader: params.request.headers.get("lock-token"),
	});

	if (!check.ok) {
		return lockedResponse(check.lockedBy);
	}

	return null;
}

export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			DAV: "1,2",
			Allow:
				"OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE, COPY, PROPPATCH, LOCK, UNLOCK",
			"MS-Author-Via": "DAV",
		},
	});
}

export async function PROPFIND(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));
		const depthHeader = request.headers.get("depth") ?? "1";

		const items: ViewerNode[] = [];
		const current = await findNodeByVirtualPath(userEmail, virtualPath);

		if (virtualPath === "/") {
			items.push({
				id: "root",
				name: "/",
				kind: "folder",
				ownerEmail: userEmail,
				sizeBytes: 0,
				updatedAt: new Date().toISOString(),
				canWrite: false,
				virtualPath: "/",
			});
		} else if (current) {
			items.push(current);
		} else {
			return new NextResponse("Not Found", { status: 404 });
		}

		if (depthHeader !== "0") {
			const children = await listViewerDirectory(userEmail, virtualPath);
			items.push(...children);
		}

		const rendered = await Promise.all(
			items.map(async (item) => {
				const locks = await listActiveLocksForPath(item.virtualPath);
				return renderResponseItem(item, locks);
			}),
		);

		const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:multistatus xmlns:d="DAV:">
${rendered.join("\n")}
</d:multistatus>`;

		return new NextResponse(xml, {
			status: 207,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				DAV: "1,2",
			},
		});
	} catch (error) {
		console.error("WebDAV PROPFIND failed", error);
		return normalizeError(error);
	}
}

export async function GET(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));
		const node = await findNodeByVirtualPath(userEmail, virtualPath);

		if (!node || node.kind !== "file") {
			return new NextResponse("Not Found", { status: 404 });
		}

		const payload = await downloadNodeContent(userEmail, node.id);
		if (!payload) {
			return new NextResponse("Not Found", { status: 404 });
		}

		return new NextResponse(new Uint8Array(payload.content), {
			status: 200,
			headers: {
				"Content-Type": payload.contentType,
				"Content-Length": String(payload.content.byteLength),
			},
		});
	} catch (error) {
		console.error("WebDAV GET failed", error);
		return normalizeError(error);
	}
}

export async function PUT(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));

		const permission = await requirePathLockPermission({
			userEmail,
			path: virtualPath,
			request,
		});
		if (permission) {
			return permission;
		}

		const segments = virtualPath.split("/").filter(Boolean);
		const fileName = segments.at(-1);
		if (!fileName) {
			return new NextResponse("Bad Request", { status: 400 });
		}

		const parentPath = `/${segments.slice(0, -1).join("/")}` || "/";
		const parentPermission = await requirePathLockPermission({
			userEmail,
			path: parentPath,
			request,
		});
		if (parentPermission) {
			return parentPermission;
		}

		const bytes = Buffer.from(await request.arrayBuffer());
		const file = new File([bytes], fileName, {
			type: request.headers.get("content-type") || "application/octet-stream",
		});

		await uploadFileInMyFiles(userEmail, parentPath, file);
		return new NextResponse(null, { status: 201 });
	} catch (error) {
		console.error("WebDAV PUT failed", error);
		return normalizeError(error);
	}
}

export async function MKCOL(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));

		const permission = await requirePathLockPermission({
			userEmail,
			path: virtualPath,
			request,
		});
		if (permission) {
			return permission;
		}

		const segments = virtualPath.split("/").filter(Boolean);
		const folderName = segments.at(-1);
		if (!folderName) {
			return new NextResponse("Bad Request", { status: 400 });
		}

		const parentPath = `/${segments.slice(0, -1).join("/")}` || "/";
		const parentPermission = await requirePathLockPermission({
			userEmail,
			path: parentPath,
			request,
		});
		if (parentPermission) {
			return parentPermission;
		}

		await createFolderInMyFiles(userEmail, parentPath, folderName);
		return new NextResponse(null, { status: 201 });
	} catch (error) {
		console.error("WebDAV MKCOL failed", error);
		return normalizeError(error);
	}
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));
		const node = await findNodeByVirtualPath(userEmail, virtualPath);

		if (!node) {
			return new NextResponse("Not Found", { status: 404 });
		}

		const permission = await requirePathLockPermission({
			userEmail,
			path: virtualPath,
			request,
		});
		if (permission) {
			return permission;
		}

		await deleteNode(userEmail, node.id);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		console.error("WebDAV DELETE failed", error);
		return normalizeError(error);
	}
}

export async function MOVE(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const sourcePath = normalizeVirtualPath(decodePathSegments(path));
		const node = await findNodeByVirtualPath(userEmail, sourcePath);

		if (!node) {
			return new NextResponse("Not Found", { status: 404 });
		}

		const destination = parseDestinationPath(
			request.headers.get("destination"),
		);
		if (!destination) {
			return new NextResponse("Bad Request", { status: 400 });
		}

		const destinationPath = normalizeVirtualPath(destination);

		const sourcePermission = await requirePathLockPermission({
			userEmail,
			path: sourcePath,
			request,
		});
		if (sourcePermission) {
			return sourcePermission;
		}

		const destinationPermission = await requirePathLockPermission({
			userEmail,
			path: destinationPath,
			request,
		});
		if (destinationPermission) {
			return destinationPermission;
		}

		await moveNode(userEmail, node.id, destinationPath);
		return new NextResponse(null, { status: 201 });
	} catch (error) {
		console.error("WebDAV MOVE failed", error);
		return normalizeError(error);
	}
}

export async function COPY(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const sourcePath = normalizeVirtualPath(decodePathSegments(path));
		const sourceNode = await findNodeByVirtualPath(userEmail, sourcePath);

		if (!sourceNode) {
			return new NextResponse("Not Found", { status: 404 });
		}

		const destination = parseDestinationPath(
			request.headers.get("destination"),
		);
		if (!destination) {
			return new NextResponse("Bad Request", { status: 400 });
		}

		const destinationPath = normalizeVirtualPath(destination);

		const sourcePermission = await requirePathLockPermission({
			userEmail,
			path: sourcePath,
			request,
		});
		if (sourcePermission) {
			return sourcePermission;
		}

		const destinationPermission = await requirePathLockPermission({
			userEmail,
			path: destinationPath,
			request,
		});
		if (destinationPermission) {
			return destinationPermission;
		}

		const overwriteHeader = request.headers.get("overwrite") ?? "T";
		const depthHeader = (
			request.headers.get("depth") ?? "infinity"
		).toLowerCase();

		await copyNode(userEmail, sourceNode.id, destinationPath, {
			overwrite: overwriteHeader.toUpperCase() !== "F",
			depth: depthHeader === "0" ? "0" : "infinity",
		});

		return new NextResponse(null, { status: 201 });
	} catch (error) {
		console.error("WebDAV COPY failed", error);
		return normalizeError(error);
	}
}

export async function PROPPATCH(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));

		const permission = await requirePathLockPermission({
			userEmail,
			path: virtualPath,
			request,
		});
		if (permission) {
			return permission;
		}

		return new NextResponse(null, { status: 207 });
	} catch (error) {
		return normalizeError(error);
	}
}

export async function LOCK(
	request: Request,
	context: { params: Promise<{ path?: string[] }> },
) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const { path } = await context.params;
		const virtualPath = normalizeVirtualPath(decodePathSegments(path));

		const submittedTokens = extractSubmittedLockTokens(
			request.headers.get("if"),
			request.headers.get("lock-token"),
		);

		const depthHeader =
			request.headers.get("depth")?.toLowerCase() === "0" ? "0" : "infinity";
		const timeoutSec = parseTimeoutSeconds(request.headers.get("timeout"));
		const body = await request.text();
		const owner = parseOwnerFromBody(body);

		const lock = await createOrRefreshLock({
			path: virtualPath,
			userEmail,
			depth: depthHeader,
			owner,
			timeoutSec,
			submittedTokens,
		});

		const status = submittedTokens.length > 0 ? 200 : 201;
		const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:prop xmlns:d="DAV:">
  ${lockDiscoveryXml([
		{
			id: "response",
			userEmail,
			lockPath: lock.lockPath,
			depth: lock.depth,
			owner: lock.owner,
			token: lock.token,
			timeoutSec: lock.timeoutSec,
			expiresAt: lock.expiresAt,
		},
	])}
</d:prop>`;

		return new NextResponse(xml, {
			status,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				"Lock-Token": `<opaquelocktoken:${lock.token}>`,
				Timeout: `Second-${lock.timeoutSec}`,
			},
		});
	} catch (error) {
		console.error("WebDAV LOCK failed", error);
		return normalizeError(error);
	}
}

export async function UNLOCK(request: Request) {
	const userEmail = await authFromBasic(request);
	if (!userEmail) {
		return unauthorizedResponse();
	}

	try {
		const submittedTokens = extractSubmittedLockTokens(
			request.headers.get("if"),
			request.headers.get("lock-token"),
		);

		const token = submittedTokens[0];
		if (!token) {
			return new NextResponse("Lock-Token header is required.", {
				status: 400,
			});
		}

		const unlocked = await unlockWithToken({ token, userEmail });
		if (!unlocked) {
			return new NextResponse("Lock token not found.", { status: 409 });
		}

		return new NextResponse(null, { status: 204 });
	} catch (error) {
		console.error("WebDAV UNLOCK failed", error);
		return normalizeError(error);
	}
}
