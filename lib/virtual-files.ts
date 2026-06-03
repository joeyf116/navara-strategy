import { randomUUID } from "node:crypto";

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

export type VirtualNodeKind = "file" | "folder";

export type VirtualNode = {
	id: string;
	owner_email: string;
	parent_id: string | null;
	name: string;
	kind: VirtualNodeKind;
	storage_key: string | null;
	size_bytes: number;
	content_type: string | null;
	created_at: string;
	updated_at: string;
};

export type ViewerNode = {
	id: string;
	name: string;
	kind: VirtualNodeKind;
	ownerEmail: string;
	sizeBytes: number;
	updatedAt: string;
	canWrite: boolean;
	virtualPath: string;
};

type CopyOptions = {
	overwrite: boolean;
	depth: "0" | "infinity";
};

type ShareRecord = {
	id: string;
	ownerEmail: string;
	s3KeyPrefix: string;
	nodeName: string;
	nodeKind: VirtualNodeKind;
	canWrite: boolean;
	createdAt: string;
};

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");
const s3Client = filesBucket ? new S3Client({}) : null;

// ─── Path / key helpers ───────────────────────────────────────────────────────

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function encodeEmail(email: string) {
	return encodeURIComponent(normalizeEmail(email));
}

function splitPath(rawPath: string) {
	return rawPath
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function normalizeVirtualPath(rawPath: string) {
	return `/${splitPath(rawPath).join("/")}`;
}

function metaKey(type: string, name: string): string {
	const base = filesBucketPrefix ? `${filesBucketPrefix}/` : "";
	return `${base}.metadata/${type}/${name}`;
}

function userKeyPrefix(email: string): string {
	const base = filesBucketPrefix ? `${filesBucketPrefix}/` : "";
	return `${base}user-files/${encodeEmail(email)}/`;
}

function segmentsToS3Key(
	email: string,
	relSegments: string[],
	isFolder: boolean,
): string {
	const prefix = userKeyPrefix(email);
	const joined = relSegments.join("/");
	return isFolder ? `${prefix}${joined}/` : `${prefix}${joined}`;
}

function makeNodeId(virtualPath: string): string {
	return Buffer.from(virtualPath).toString("base64url");
}

function decodeNodeId(id: string): string | null {
	try {
		return Buffer.from(id, "base64url").toString("utf8");
	} catch {
		return null;
	}
}

// ─── S3 primitives ────────────────────────────────────────────────────────────

async function streamToBuffer(body: unknown): Promise<Buffer> {
	if (!body) return Buffer.alloc(0);
	if (body instanceof Uint8Array) return Buffer.from(body);
	const xf = body as { transformToByteArray?: () => Promise<Uint8Array> };
	if (typeof xf.transformToByteArray === "function") {
		return Buffer.from(await xf.transformToByteArray());
	}
	const ai = body as AsyncIterable<Uint8Array>;
	if (typeof ai[Symbol.asyncIterator] === "function") {
		const chunks: Buffer[] = [];
		for await (const chunk of ai) chunks.push(Buffer.from(chunk));
		return Buffer.concat(chunks);
	}
	throw new Error("Unsupported storage body type.");
}

async function headS3Object(
	s3Key: string,
): Promise<{
	sizeBytes: number;
	lastModified: Date;
	contentType: string;
} | null> {
	if (!filesBucket || !s3Client) return null;
	try {
		const resp = await s3Client.send(
			new HeadObjectCommand({ Bucket: filesBucket, Key: s3Key }),
		);
		return {
			sizeBytes: resp.ContentLength ?? 0,
			lastModified: resp.LastModified ?? new Date(0),
			contentType: resp.ContentType ?? "application/octet-stream",
		};
	} catch (err: unknown) {
		if (
			(err as { name?: string }).name === "NotFound" ||
			(err as { $metadata?: { httpStatusCode?: number } }).$metadata
				?.httpStatusCode === 404
		) {
			return null;
		}
		throw err;
	}
}

async function listS3Dir(
	email: string,
	relSegments: string[],
): Promise<{
	folders: string[];
	files: Array<{ key: string; size: number; lastModified: Date }>;
}> {
	if (!filesBucket || !s3Client) return { folders: [], files: [] };
	const prefix =
		relSegments.length > 0
			? segmentsToS3Key(email, relSegments, true)
			: userKeyPrefix(email);

	const folders: string[] = [];
	const files: Array<{ key: string; size: number; lastModified: Date }> = [];
	let ct: string | undefined;
	do {
		const resp = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: filesBucket,
				Prefix: prefix,
				Delimiter: "/",
				ContinuationToken: ct,
			}),
		);
		for (const cp of resp.CommonPrefixes ?? []) {
			if (cp.Prefix) folders.push(cp.Prefix);
		}
		for (const obj of resp.Contents ?? []) {
			if (!obj.Key || obj.Key === prefix) continue;
			files.push({
				key: obj.Key,
				size: obj.Size ?? 0,
				lastModified: obj.LastModified ?? new Date(0),
			});
		}
		ct = resp.NextContinuationToken;
	} while (ct);
	return { folders, files };
}

async function listAllS3Objects(
	keyPrefix: string,
): Promise<Array<{ key: string; size: number }>> {
	if (!filesBucket || !s3Client) return [];
	const results: Array<{ key: string; size: number }> = [];
	let ct: string | undefined;
	do {
		const resp = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: filesBucket,
				Prefix: keyPrefix,
				ContinuationToken: ct,
			}),
		);
		for (const obj of resp.Contents ?? []) {
			if (obj.Key) results.push({ key: obj.Key, size: obj.Size ?? 0 });
		}
		ct = resp.NextContinuationToken;
	} while (ct);
	return results;
}

async function putContent(
	s3Key: string,
	content: Buffer,
	contentType: string,
): Promise<void> {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}
	await s3Client.send(
		new PutObjectCommand({
			Bucket: filesBucket,
			Key: s3Key,
			Body: content,
			ContentType: contentType || "application/octet-stream",
		}),
	);
}

async function getContent(s3Key: string): Promise<Buffer> {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}
	const resp = await s3Client.send(
		new GetObjectCommand({ Bucket: filesBucket, Key: s3Key }),
	);
	return streamToBuffer(resp.Body);
}

async function deleteS3Object(s3Key: string): Promise<void> {
	if (!filesBucket || !s3Client) return;
	await s3Client.send(
		new DeleteObjectCommand({ Bucket: filesBucket, Key: s3Key }),
	);
}

async function copyS3Object(srcKey: string, dstKey: string): Promise<void> {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}
	await s3Client.send(
		new CopyObjectCommand({
			Bucket: filesBucket,
			CopySource: `${filesBucket}/${srcKey}`,
			Key: dstKey,
		}),
	);
}

// ─── Share record helpers ─────────────────────────────────────────────────────

async function readSharesForGrantee(email: string): Promise<ShareRecord[]> {
	const key = metaKey("shares", `${encodeEmail(email)}.json`);
	if (!filesBucket || !s3Client) return [];
	try {
		const resp = await s3Client.send(
			new GetObjectCommand({ Bucket: filesBucket, Key: key }),
		);
		const buf = await streamToBuffer(resp.Body);
		return JSON.parse(buf.toString("utf8")) as ShareRecord[];
	} catch (err: unknown) {
		if ((err as { name?: string }).name === "NoSuchKey") return [];
		throw err;
	}
}

async function writeSharesForGrantee(
	email: string,
	shares: ShareRecord[],
): Promise<void> {
	const key = metaKey("shares", `${encodeEmail(email)}.json`);
	if (!filesBucket || !s3Client) return;
	await s3Client.send(
		new PutObjectCommand({
			Bucket: filesBucket,
			Key: key,
			Body: JSON.stringify(shares),
			ContentType: "application/json",
		}),
	);
}

/** Returns true when any share grants access to the given owner+path combo. */
function resolveShareAccess(
	shares: ShareRecord[],
	ownerEmail: string,
	relSegments: string[],
): { canRead: boolean; canWrite: boolean } {
	const targetPrefix = userKeyPrefix(ownerEmail);
	const targetKey =
		relSegments.length > 0
			? segmentsToS3Key(ownerEmail, relSegments, false)
			: null;
	const targetFolderKey =
		relSegments.length > 0
			? segmentsToS3Key(ownerEmail, relSegments, true)
			: null;

	let canRead = false;
	let canWrite = false;

	for (const share of shares) {
		if (normalizeEmail(share.ownerEmail) !== normalizeEmail(ownerEmail))
			continue;
		// share.s3KeyPrefix is the S3 key prefix of the shared item
		const isMatch =
			(targetKey && targetKey.startsWith(share.s3KeyPrefix)) ||
			(targetFolderKey && targetFolderKey.startsWith(share.s3KeyPrefix)) ||
			(targetKey && share.s3KeyPrefix.startsWith(targetPrefix));
		if (isMatch) {
			canRead = true;
			if (share.canWrite) canWrite = true;
		}
	}
	return { canRead, canWrite };
}

// ─── Node builders ────────────────────────────────────────────────────────────

function makeViewerNode(
	name: string,
	kind: VirtualNodeKind,
	ownerEmail: string,
	sizeBytes: number,
	updatedAt: string,
	canWrite: boolean,
	virtualPath: string,
): ViewerNode {
	return {
		id: makeNodeId(virtualPath),
		name,
		kind,
		ownerEmail,
		sizeBytes,
		updatedAt,
		canWrite,
		virtualPath,
	};
}

function makeVirtualNode(
	s3Key: string,
	ownerEmail: string,
	name: string,
	kind: VirtualNodeKind,
	sizeBytes: number,
	contentType: string | null,
	lastModified: Date,
	virtualPath: string,
): VirtualNode {
	const now = lastModified.toISOString();
	return {
		id: makeNodeId(virtualPath),
		owner_email: ownerEmail,
		parent_id: null,
		name,
		kind,
		storage_key: s3Key,
		size_bytes: sizeBytes,
		content_type: contentType,
		created_at: now,
		updated_at: now,
	};
}

// ─── Move/copy recursive helper ───────────────────────────────────────────────

async function moveSrcToDst(
	srcEmail: string,
	srcRelSegments: string[],
	kind: VirtualNodeKind,
	dstEmail: string,
	dstRelSegments: string[],
	depth: "0" | "infinity",
): Promise<void> {
	if (kind === "file") {
		const srcKey = segmentsToS3Key(srcEmail, srcRelSegments, false);
		const dstKey = segmentsToS3Key(dstEmail, dstRelSegments, false);
		await copyS3Object(srcKey, dstKey);
		await deleteS3Object(srcKey);
		return;
	}

	// folder
	const srcFolderKey = segmentsToS3Key(srcEmail, srcRelSegments, true);
	const dstFolderKey = segmentsToS3Key(dstEmail, dstRelSegments, true);
	await copyS3Object(srcFolderKey, dstFolderKey).catch(() => {});

	if (depth === "infinity") {
		const children = await listAllS3Objects(srcFolderKey);
		for (const child of children) {
			const rel = child.key.slice(srcFolderKey.length);
			const dstChildKey = `${dstFolderKey}${rel}`;
			await copyS3Object(child.key, dstChildKey);
		}
	}
	// Delete source
	const srcObjects = await listAllS3Objects(srcFolderKey);
	for (const obj of srcObjects) await deleteS3Object(obj.key);
	await deleteS3Object(srcFolderKey).catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function ensureVirtualFilesSchema() {
	// No-op: S3 is the backing store.
}

export async function listViewerDirectory(
	viewerEmailRaw: string,
	rawPath: string,
): Promise<ViewerNode[]> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const segments = splitPath(rawPath || "/");

	if (segments.length === 0) {
		return [
			makeViewerNode(
				"My Files",
				"folder",
				viewerEmail,
				0,
				new Date(0).toISOString(),
				true,
				"/My Files",
			),
			makeViewerNode(
				"Shared with Me",
				"folder",
				viewerEmail,
				0,
				new Date(0).toISOString(),
				false,
				"/Shared with Me",
			),
		];
	}

	if (segments[0] === "My Files") {
		const relSegments = segments.slice(1);
		const { folders, files } = await listS3Dir(viewerEmail, relSegments);
		const nodes: ViewerNode[] = [];
		for (const folderPrefix of folders) {
			const prefix = userKeyPrefix(viewerEmail);
			const relPath = folderPrefix.slice(prefix.length).replace(/\/$/, "");
			const name = relPath.split("/").at(-1) ?? relPath;
			const vPath = `/My Files/${relPath}`;
			nodes.push(
				makeViewerNode(
					name,
					"folder",
					viewerEmail,
					0,
					new Date(0).toISOString(),
					true,
					vPath,
				),
			);
		}
		for (const file of files) {
			const prefix = userKeyPrefix(viewerEmail);
			const relPath = file.key.slice(prefix.length);
			const name = relPath.split("/").at(-1) ?? relPath;
			const vPath = `/My Files/${relPath}`;
			nodes.push(
				makeViewerNode(
					name,
					"file",
					viewerEmail,
					file.size,
					file.lastModified.toISOString(),
					true,
					vPath,
				),
			);
		}
		nodes.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		return nodes;
	}

	if (segments[0] === "Shared with Me") {
		const shares = await readSharesForGrantee(viewerEmail);
		if (segments.length === 1) {
			const owners = [
				...new Set(shares.map((s) => normalizeEmail(s.ownerEmail))),
			].sort();
			return owners.map((owner) =>
				makeViewerNode(
					owner,
					"folder",
					owner,
					0,
					new Date(0).toISOString(),
					false,
					`/Shared with Me/${owner}`,
				),
			);
		}

		const ownerEmail = normalizeEmail(segments[1] ?? "");
		const ownerShares = shares.filter(
			(s) => normalizeEmail(s.ownerEmail) === ownerEmail,
		);

		if (segments.length === 2) {
			const nodes: ViewerNode[] = [];
			for (const share of ownerShares) {
				nodes.push(
					makeViewerNode(
						share.nodeName,
						share.nodeKind,
						ownerEmail,
						0,
						share.createdAt,
						share.canWrite,
						`/Shared with Me/${ownerEmail}/${share.nodeName}`,
					),
				);
			}
			return nodes;
		}

		// Navigating inside a shared folder
		const sharedRoot = ownerShares.find((s) => s.nodeName === segments[2]);
		if (!sharedRoot || sharedRoot.nodeKind !== "folder") return [];
		const innerSegments = segments.slice(3);
		const { folders, files } = await listS3Dir(ownerEmail, [
			sharedRoot.nodeName,
			...innerSegments,
		]);
		const nodes: ViewerNode[] = [];
		for (const folderPrefix of folders) {
			const prefix = userKeyPrefix(ownerEmail);
			const relPath = folderPrefix.slice(prefix.length).replace(/\/$/, "");
			const name = relPath.split("/").at(-1) ?? relPath;
			const vPath = `/Shared with Me/${ownerEmail}/${relPath}`;
			nodes.push(
				makeViewerNode(
					name,
					"folder",
					ownerEmail,
					0,
					new Date(0).toISOString(),
					sharedRoot.canWrite,
					vPath,
				),
			);
		}
		for (const file of files) {
			const prefix = userKeyPrefix(ownerEmail);
			const relPath = file.key.slice(prefix.length);
			const name = relPath.split("/").at(-1) ?? relPath;
			const vPath = `/Shared with Me/${ownerEmail}/${relPath}`;
			nodes.push(
				makeViewerNode(
					name,
					"file",
					ownerEmail,
					file.size,
					file.lastModified.toISOString(),
					sharedRoot.canWrite,
					vPath,
				),
			);
		}
		nodes.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		return nodes;
	}

	return [];
}

export async function findNodeByVirtualPath(
	viewerEmailRaw: string,
	rawPath: string,
): Promise<ViewerNode | null> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const virtualPath = normalizeVirtualPath(rawPath);
	const segments = splitPath(virtualPath);

	if (segments.length === 0) {
		return makeViewerNode(
			"/",
			"folder",
			viewerEmail,
			0,
			new Date().toISOString(),
			false,
			"/",
		);
	}

	const parentPath = `/${segments.slice(0, -1).join("/")}` || "/";
	const name = segments.at(-1);
	if (!name) return null;

	const siblings = await listViewerDirectory(viewerEmail, parentPath);
	return (
		siblings.find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null
	);
}

export async function createFolderInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	folderNameRaw: string,
): Promise<string> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const folderName = folderNameRaw.trim();
	if (!folderName) throw new Error("Folder name is required.");

	const segments = splitPath(targetPath);
	if (segments[0] !== "My Files") {
		throw new Error("Folders can only be created in My Files.");
	}

	const relSegments = [...segments.slice(1), folderName];
	const folderKey = segmentsToS3Key(viewerEmail, relSegments, true);
	await putContent(folderKey, Buffer.alloc(0), "application/x-directory");

	const virtualPath = `/My Files/${relSegments.join("/")}`;
	return makeNodeId(virtualPath);
}

export async function uploadFileInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	file: File,
): Promise<string> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const segments = splitPath(targetPath);
	if (segments[0] !== "My Files") {
		throw new Error("Uploads can only target My Files.");
	}

	const relSegments = [...segments.slice(1), file.name];
	const s3Key = segmentsToS3Key(viewerEmail, relSegments, false);
	const bytes = Buffer.from(await file.arrayBuffer());
	await putContent(s3Key, bytes, file.type || "application/octet-stream");

	const virtualPath = `/My Files/${relSegments.join("/")}`;
	return makeNodeId(virtualPath);
}

export async function getNodeForViewer(
	viewerEmailRaw: string,
	id: string,
): Promise<{ node: VirtualNode; canWrite: boolean } | null> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const virtualPath = decodeNodeId(id);
	if (!virtualPath) return null;

	const segments = splitPath(virtualPath);
	if (segments.length === 0) return null;

	if (segments[0] === "My Files") {
		const relSegments = segments.slice(1);
		if (relSegments.length === 0) return null;

		const name = relSegments.at(-1)!;

		// Try file first
		const fileKey = segmentsToS3Key(viewerEmail, relSegments, false);
		const fileMeta = await headS3Object(fileKey);
		if (fileMeta) {
			return {
				node: makeVirtualNode(
					fileKey,
					viewerEmail,
					name,
					"file",
					fileMeta.sizeBytes,
					fileMeta.contentType,
					fileMeta.lastModified,
					virtualPath,
				),
				canWrite: true,
			};
		}

		// Try folder
		const folderKey = segmentsToS3Key(viewerEmail, relSegments, true);
		const folderMeta = await headS3Object(folderKey);
		if (folderMeta) {
			return {
				node: makeVirtualNode(
					folderKey,
					viewerEmail,
					name,
					"folder",
					0,
					null,
					folderMeta.lastModified,
					virtualPath,
				),
				canWrite: true,
			};
		}

		// Check if directory has objects (folder without marker)
		const { folders, files } = await listS3Dir(viewerEmail, relSegments);
		if (folders.length > 0 || files.length > 0) {
			return {
				node: makeVirtualNode(
					folderKey,
					viewerEmail,
					name,
					"folder",
					0,
					null,
					new Date(),
					virtualPath,
				),
				canWrite: true,
			};
		}
		return null;
	}

	if (segments[0] === "Shared with Me") {
		const ownerEmail = normalizeEmail(segments[1] ?? "");
		const ownerRelSegments = segments.slice(2);
		if (ownerRelSegments.length === 0) return null;

		const shares = await readSharesForGrantee(viewerEmail);
		const { canRead, canWrite } = resolveShareAccess(
			shares,
			ownerEmail,
			ownerRelSegments,
		);
		if (!canRead) return null;

		const name = ownerRelSegments.at(-1)!;
		const fileKey = segmentsToS3Key(ownerEmail, ownerRelSegments, false);
		const fileMeta = await headS3Object(fileKey);
		if (fileMeta) {
			return {
				node: makeVirtualNode(
					fileKey,
					ownerEmail,
					name,
					"file",
					fileMeta.sizeBytes,
					fileMeta.contentType,
					fileMeta.lastModified,
					virtualPath,
				),
				canWrite,
			};
		}
		const folderKey = segmentsToS3Key(ownerEmail, ownerRelSegments, true);
		return {
			node: makeVirtualNode(
				folderKey,
				ownerEmail,
				name,
				"folder",
				0,
				null,
				new Date(),
				virtualPath,
			),
			canWrite,
		};
	}

	return null;
}

export async function downloadNodeContent(
	viewerEmail: string,
	id: string,
): Promise<{ fileName: string; contentType: string; content: Buffer } | null> {
	const access = await getNodeForViewer(viewerEmail, id);
	if (!access || access.node.kind !== "file" || !access.node.storage_key) {
		return null;
	}
	const content = await getContent(access.node.storage_key);
	return {
		fileName: access.node.name,
		contentType: access.node.content_type || "application/octet-stream",
		content,
	};
}

export async function renameNode(
	viewerEmailRaw: string,
	id: string,
	newNameRaw: string,
): Promise<void> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const access = await getNodeForViewer(viewerEmail, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const newName = newNameRaw.trim();
	if (!newName) throw new Error("Name is required.");

	const virtualPath = decodeNodeId(id)!;
	const segments = splitPath(virtualPath);
	const parentSegments = segments.slice(1, -1); // strips 'My Files' + filename
	const email = access.node.owner_email;

	const newRelSegments = [...parentSegments, newName];
	await moveSrcToDst(
		email,
		[...parentSegments, segments.at(-1)!],
		access.node.kind,
		email,
		newRelSegments,
		"infinity",
	);
}

export async function deleteNode(
	viewerEmailRaw: string,
	id: string,
): Promise<void> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const access = await getNodeForViewer(viewerEmail, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const s3Key = access.node.storage_key;
	if (!s3Key) return;

	if (access.node.kind === "file") {
		await deleteS3Object(s3Key);
	} else {
		const allObjects = await listAllS3Objects(s3Key);
		for (const obj of allObjects) await deleteS3Object(obj.key);
		await deleteS3Object(s3Key).catch(() => {});
	}
}

export async function shareNodeWithUser(
	viewerEmailRaw: string,
	nodeId: string,
	granteeEmailRaw: string,
	canWrite: boolean,
): Promise<void> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const granteeEmail = normalizeEmail(granteeEmailRaw);

	const virtualPath = decodeNodeId(nodeId);
	if (!virtualPath) throw new Error("Invalid node ID.");

	const segments = splitPath(virtualPath);
	if (segments[0] !== "My Files") {
		throw new Error("Only the owner can share items from My Files.");
	}

	const relSegments = segments.slice(1);
	const isFolder = true; // share at folder level with prefix
	const s3KeyPrefix = segmentsToS3Key(viewerEmail, relSegments, isFolder);
	const nodeName = segments.at(-1)!;

	// Determine kind
	const fileKey = segmentsToS3Key(viewerEmail, relSegments, false);
	const fileMeta = await headS3Object(fileKey);
	const nodeKind: VirtualNodeKind = fileMeta ? "file" : "folder";
	const actualPrefix = nodeKind === "file" ? fileKey : s3KeyPrefix;

	const shares = await readSharesForGrantee(granteeEmail);
	const existing = shares.findIndex(
		(s) =>
			normalizeEmail(s.ownerEmail) === viewerEmail && s.nodeName === nodeName,
	);
	const record: ShareRecord = {
		id: existing >= 0 ? shares[existing].id : randomUUID(),
		ownerEmail: viewerEmail,
		s3KeyPrefix: actualPrefix,
		nodeName,
		nodeKind,
		canWrite,
		createdAt:
			existing >= 0 ? shares[existing].createdAt : new Date().toISOString(),
	};
	if (existing >= 0) shares[existing] = record;
	else shares.push(record);
	await writeSharesForGrantee(granteeEmail, shares);
}

export async function moveNode(
	viewerEmailRaw: string,
	nodeId: string,
	destinationPathRaw: string,
): Promise<void> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const access = await getNodeForViewer(viewerEmail, nodeId);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to move this item.");
	}

	const destSegments = splitPath(destinationPathRaw);
	if (destSegments[0] !== "My Files") {
		throw new Error("Moves are only supported inside My Files.");
	}

	const newName = destSegments.at(-1);
	if (!newName) throw new Error("Destination name is required.");

	const srcPath = decodeNodeId(nodeId)!;
	const srcSegments = splitPath(srcPath).slice(1); // remove 'My Files'
	const dstSegments = destSegments.slice(1); // remove 'My Files'

	const email = access.node.owner_email;
	await moveSrcToDst(
		email,
		srcSegments,
		access.node.kind,
		email,
		dstSegments,
		"infinity",
	);
}

export async function copyNode(
	viewerEmailRaw: string,
	sourceNodeId: string,
	destinationPathRaw: string,
	options: CopyOptions,
): Promise<string> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const access = await getNodeForViewer(viewerEmail, sourceNodeId);
	if (!access) throw new Error("Source item is not accessible.");

	const destSegments = splitPath(destinationPathRaw);
	if (destSegments[0] !== "My Files") {
		throw new Error("COPY destination must be under My Files.");
	}

	const destName = destSegments.at(-1);
	if (!destName) throw new Error("Destination path is invalid.");

	const dstRelSegments = destSegments.slice(1);
	const dstKey =
		access.node.kind === "file"
			? segmentsToS3Key(viewerEmail, dstRelSegments, false)
			: segmentsToS3Key(viewerEmail, dstRelSegments, true);

	if (options.overwrite) {
		if (access.node.kind === "file") {
			await deleteS3Object(dstKey).catch(() => {});
		} else {
			const existing = await listAllS3Objects(dstKey);
			for (const obj of existing) await deleteS3Object(obj.key);
		}
	}

	const srcPath = decodeNodeId(sourceNodeId)!;
	const srcRelSegments = splitPath(srcPath).slice(1);
	const srcKey =
		access.node.kind === "file"
			? segmentsToS3Key(access.node.owner_email, srcRelSegments, false)
			: segmentsToS3Key(access.node.owner_email, srcRelSegments, true);

	if (access.node.kind === "file") {
		await copyS3Object(srcKey, dstKey);
	} else {
		await copyS3Object(srcKey, dstKey).catch(() => {});
		if (options.depth === "infinity") {
			const children = await listAllS3Objects(srcKey);
			for (const child of children) {
				const rel = child.key.slice(srcKey.length);
				await copyS3Object(child.key, `${dstKey}${rel}`);
			}
		}
	}

	const virtualPath = `/My Files/${dstRelSegments.join("/")}`;
	return makeNodeId(virtualPath);
}
