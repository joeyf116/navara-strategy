import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

import {
	normalizeCompanyId,
	resolveUserCompanyAccess,
} from "@/lib/company-access";

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

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");
const s3Client = filesBucket ? new S3Client({}) : null;

const ROOT_FOLDERS = ["to_navara", "from_navara"];

function splitPath(rawPath: string): string[] {
	return rawPath
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function normalizeVirtualPath(rawPath: string): string {
	const parts = splitPath(rawPath);
	return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function withPrefix(value: string): string {
	return filesBucketPrefix ? `${filesBucketPrefix}/${value}` : value;
}

function companyPrefix(companyId: string): string {
	return withPrefix(`${companyId}/`);
}

function segmentsToS3Key(
	companyId: string,
	relSegments: string[],
	isFolder: boolean,
): string {
	const prefix = companyPrefix(companyId);
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
	const iso = lastModified.toISOString();
	return {
		id: makeNodeId(virtualPath),
		owner_email: ownerEmail,
		parent_id: null,
		name,
		kind,
		storage_key: s3Key,
		size_bytes: sizeBytes,
		content_type: contentType,
		created_at: iso,
		updated_at: iso,
	};
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
	if (!body) return Buffer.alloc(0);
	if (body instanceof Uint8Array) return Buffer.from(body);
	const transformed = body as {
		transformToByteArray?: () => Promise<Uint8Array>;
	};
	if (typeof transformed.transformToByteArray === "function") {
		return Buffer.from(await transformed.transformToByteArray());
	}
	const iterable = body as AsyncIterable<Uint8Array>;
	if (typeof iterable[Symbol.asyncIterator] === "function") {
		const chunks: Buffer[] = [];
		for await (const chunk of iterable) chunks.push(Buffer.from(chunk));
		return Buffer.concat(chunks);
	}
	throw new Error("Unsupported storage body type.");
}

async function headS3Object(s3Key: string): Promise<{
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
	} catch (error: unknown) {
		if (
			(error as { name?: string }).name === "NotFound" ||
			(error as { $metadata?: { httpStatusCode?: number } }).$metadata
				?.httpStatusCode === 404
		) {
			return null;
		}
		throw error;
	}
}

async function listS3Dir(
	companyId: string,
	relSegments: string[],
): Promise<{
	folders: string[];
	files: Array<{ key: string; size: number; lastModified: Date }>;
}> {
	if (!filesBucket || !s3Client) return { folders: [], files: [] };
	const prefix =
		relSegments.length > 0
			? segmentsToS3Key(companyId, relSegments, true)
			: companyPrefix(companyId);

	const folders: string[] = [];
	const files: Array<{ key: string; size: number; lastModified: Date }> = [];
	let continuationToken: string | undefined;

	do {
		const resp = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: filesBucket,
				Prefix: prefix,
				Delimiter: "/",
				ContinuationToken: continuationToken,
			}),
		);
		for (const commonPrefix of resp.CommonPrefixes ?? []) {
			if (commonPrefix.Prefix) folders.push(commonPrefix.Prefix);
		}
		for (const obj of resp.Contents ?? []) {
			if (!obj.Key || obj.Key === prefix) continue;
			files.push({
				key: obj.Key,
				size: obj.Size ?? 0,
				lastModified: obj.LastModified ?? new Date(0),
			});
		}
		continuationToken = resp.NextContinuationToken;
	} while (continuationToken);

	return { folders, files };
}

async function listAllS3Objects(
	prefix: string,
): Promise<Array<{ key: string; size: number }>> {
	if (!filesBucket || !s3Client) return [];
	const out: Array<{ key: string; size: number }> = [];
	let continuationToken: string | undefined;

	do {
		const resp = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: filesBucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			}),
		);
		for (const obj of resp.Contents ?? []) {
			if (obj.Key) {
				out.push({ key: obj.Key, size: obj.Size ?? 0 });
			}
		}
		continuationToken = resp.NextContinuationToken;
	} while (continuationToken);

	return out;
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

async function getAccessGrant(
	viewerEmailRaw: string,
	companyIdRaw: string,
): Promise<{ companyId: string; canWrite: boolean } | null> {
	const companyId = normalizeCompanyId(companyIdRaw);
	if (!companyId) return null;
	const access = await resolveUserCompanyAccess(viewerEmailRaw);
	const grant = access.grants.find((item) => item.companyId === companyId);
	if (!grant) return null;
	return grant;
}

function sanitizeSegments(segments: string[]): string[] {
	return segments
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => segment.replace(/\.+/g, "."));
}

async function getNodeForViewer(
	viewerEmailRaw: string,
	id: string,
): Promise<{ node: VirtualNode; canWrite: boolean } | null> {
	const virtualPath = decodeNodeId(id);
	if (!virtualPath) return null;

	const segments = sanitizeSegments(splitPath(virtualPath));
	if (segments.length === 0) return null;

	const companyId = normalizeCompanyId(segments[0]);
	const grant = await getAccessGrant(viewerEmailRaw, companyId);
	if (!grant) return null;

	if (segments.length === 1) {
		const rootPrefix = companyPrefix(companyId);
		return {
			node: makeVirtualNode(
				rootPrefix,
				companyId,
				companyId,
				"folder",
				0,
				null,
				new Date(),
				`/${companyId}`,
			),
			canWrite: grant.canWrite,
		};
	}

	const relSegments = segments.slice(1);
	const name = relSegments.at(-1) ?? companyId;
	const fileKey = segmentsToS3Key(companyId, relSegments, false);
	const fileMeta = await headS3Object(fileKey);
	if (fileMeta) {
		return {
			node: makeVirtualNode(
				fileKey,
				companyId,
				name,
				"file",
				fileMeta.sizeBytes,
				fileMeta.contentType,
				fileMeta.lastModified,
				normalizeVirtualPath(virtualPath),
			),
			canWrite: grant.canWrite,
		};
	}

	const folderKey = segmentsToS3Key(companyId, relSegments, true);
	const folderMeta = await headS3Object(folderKey);
	if (folderMeta) {
		return {
			node: makeVirtualNode(
				folderKey,
				companyId,
				name,
				"folder",
				0,
				null,
				folderMeta.lastModified,
				normalizeVirtualPath(virtualPath),
			),
			canWrite: grant.canWrite,
		};
	}

	const listing = await listS3Dir(companyId, relSegments);
	if (listing.folders.length > 0 || listing.files.length > 0) {
		return {
			node: makeVirtualNode(
				folderKey,
				companyId,
				name,
				"folder",
				0,
				null,
				new Date(),
				normalizeVirtualPath(virtualPath),
			),
			canWrite: grant.canWrite,
		};
	}

	return null;
}

async function moveSrcToDst(
	srcCompanyId: string,
	srcRelSegments: string[],
	kind: VirtualNodeKind,
	dstCompanyId: string,
	dstRelSegments: string[],
	depth: "0" | "infinity",
): Promise<void> {
	if (kind === "file") {
		const srcKey = segmentsToS3Key(srcCompanyId, srcRelSegments, false);
		const dstKey = segmentsToS3Key(dstCompanyId, dstRelSegments, false);
		await copyS3Object(srcKey, dstKey);
		await deleteS3Object(srcKey);
		return;
	}

	const srcFolderKey = segmentsToS3Key(srcCompanyId, srcRelSegments, true);
	const dstFolderKey = segmentsToS3Key(dstCompanyId, dstRelSegments, true);
	await copyS3Object(srcFolderKey, dstFolderKey).catch(() => {});

	if (depth === "infinity") {
		const children = await listAllS3Objects(srcFolderKey);
		for (const child of children) {
			const rel = child.key.slice(srcFolderKey.length);
			await copyS3Object(child.key, `${dstFolderKey}${rel}`);
		}
	}

	const srcObjects = await listAllS3Objects(srcFolderKey);
	for (const obj of srcObjects) {
		await deleteS3Object(obj.key);
	}
	await deleteS3Object(srcFolderKey).catch(() => {});
}

export async function ensureVirtualFilesSchema() {
	// No-op: S3 + metadata are the backing stores.
}

export async function listViewerDirectory(
	viewerEmailRaw: string,
	rawPath: string,
): Promise<ViewerNode[]> {
	const virtualPath = normalizeVirtualPath(rawPath || "/");
	const segments = sanitizeSegments(splitPath(virtualPath));
	const access = await resolveUserCompanyAccess(viewerEmailRaw);

	if (segments.length === 0) {
		return access.grants.map((grant) =>
			makeViewerNode(
				grant.companyId,
				"folder",
				grant.companyId,
				0,
				new Date(0).toISOString(),
				grant.canWrite,
				`/${grant.companyId}`,
			),
		);
	}

	const companyId = normalizeCompanyId(segments[0]);
	const grant = access.grants.find((item) => item.companyId === companyId);
	if (!grant) {
		return [];
	}

	const relSegments = segments.slice(1);
	const listing = await listS3Dir(companyId, relSegments);
	const nodes: ViewerNode[] = [];
	const prefix =
		relSegments.length > 0
			? segmentsToS3Key(companyId, relSegments, true)
			: companyPrefix(companyId);

	for (const folderPrefix of listing.folders) {
		const relPath = folderPrefix.slice(prefix.length).replace(/\/$/, "");
		if (!relPath) continue;
		const name = relPath.split("/").at(-1) ?? relPath;
		nodes.push(
			makeViewerNode(
				name,
				"folder",
				companyId,
				0,
				new Date(0).toISOString(),
				grant.canWrite,
				normalizeVirtualPath(
					`/${companyId}/${[...relSegments, relPath].join("/")}`,
				),
			),
		);
	}

	for (const file of listing.files) {
		const relPath = file.key.slice(prefix.length);
		if (!relPath) continue;
		const name = relPath.split("/").at(-1) ?? relPath;
		if (name === ".keep") continue;
		nodes.push(
			makeViewerNode(
				name,
				"file",
				companyId,
				file.size,
				file.lastModified.toISOString(),
				grant.canWrite,
				normalizeVirtualPath(
					`/${companyId}/${[...relSegments, relPath].join("/")}`,
				),
			),
		);
	}

	if (relSegments.length === 0) {
		const existing = new Set(
			nodes.filter((node) => node.kind === "folder").map((node) => node.name),
		);
		for (const rootFolder of ROOT_FOLDERS) {
			if (existing.has(rootFolder)) continue;
			nodes.push(
				makeViewerNode(
					rootFolder,
					"folder",
					companyId,
					0,
					new Date(0).toISOString(),
					grant.canWrite,
					`/${companyId}/${rootFolder}`,
				),
			);
		}
	}

	nodes.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return nodes;
}

export async function findNodeByVirtualPath(
	viewerEmailRaw: string,
	rawPath: string,
): Promise<ViewerNode | null> {
	const virtualPath = normalizeVirtualPath(rawPath);
	if (virtualPath === "/") {
		return makeViewerNode(
			"/",
			"folder",
			"root",
			0,
			new Date().toISOString(),
			false,
			"/",
		);
	}

	const segments = splitPath(virtualPath);
	if (segments.length === 1) {
		const grant = await getAccessGrant(viewerEmailRaw, segments[0]);
		if (!grant) return null;
		return makeViewerNode(
			grant.companyId,
			"folder",
			grant.companyId,
			0,
			new Date().toISOString(),
			grant.canWrite,
			`/${grant.companyId}`,
		);
	}

	const parentPath = `/${segments.slice(0, -1).join("/")}`;
	const name = segments.at(-1)?.toLowerCase();
	if (!name) return null;
	const siblings = await listViewerDirectory(viewerEmailRaw, parentPath);
	return siblings.find((item) => item.name.toLowerCase() === name) ?? null;
}

async function createFolderAtPath(
	viewerEmailRaw: string,
	targetPath: string,
	folderNameRaw: string,
): Promise<string> {
	const folderName = folderNameRaw.trim();
	if (!folderName) throw new Error("Folder name is required.");

	const targetSegments = splitPath(normalizeVirtualPath(targetPath));
	if (targetSegments.length === 0) {
		throw new Error("Select a company folder first.");
	}

	const companyId = normalizeCompanyId(targetSegments[0]);
	const grant = await getAccessGrant(viewerEmailRaw, companyId);
	if (!grant || !grant.canWrite) {
		throw new Error("You do not have write access to this company.");
	}

	const relSegments = [...targetSegments.slice(1), folderName];
	const folderKey = segmentsToS3Key(companyId, relSegments, true);
	await putContent(folderKey, Buffer.alloc(0), "application/x-directory");

	return makeNodeId(`/${companyId}/${relSegments.join("/")}`);
}

async function uploadFileAtPath(
	viewerEmailRaw: string,
	targetPath: string,
	file: File,
): Promise<string> {
	const targetSegments = splitPath(normalizeVirtualPath(targetPath));
	if (targetSegments.length === 0) {
		throw new Error("Select a company folder first.");
	}

	const companyId = normalizeCompanyId(targetSegments[0]);
	const grant = await getAccessGrant(viewerEmailRaw, companyId);
	if (!grant || !grant.canWrite) {
		throw new Error("You do not have write access to this company.");
	}

	const relSegments = [...targetSegments.slice(1), file.name];
	const s3Key = segmentsToS3Key(companyId, relSegments, false);
	const bytes = Buffer.from(await file.arrayBuffer());
	await putContent(s3Key, bytes, file.type || "application/octet-stream");

	return makeNodeId(`/${companyId}/${relSegments.join("/")}`);
}

export async function createFolderInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	folderNameRaw: string,
): Promise<string> {
	return createFolderAtPath(viewerEmailRaw, targetPath, folderNameRaw);
}

export async function uploadFileInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	file: File,
): Promise<string> {
	return uploadFileAtPath(viewerEmailRaw, targetPath, file);
}

export async function downloadNodeContent(
	viewerEmailRaw: string,
	id: string,
): Promise<{ fileName: string; contentType: string; content: Buffer } | null> {
	const access = await getNodeForViewer(viewerEmailRaw, id);
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
	const access = await getNodeForViewer(viewerEmailRaw, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const newName = newNameRaw.trim();
	if (!newName) throw new Error("Name is required.");

	const srcPath = decodeNodeId(id);
	if (!srcPath) throw new Error("Invalid node ID.");

	const srcSegments = splitPath(srcPath);
	if (srcSegments.length < 2) {
		throw new Error("Company roots cannot be renamed.");
	}

	const companyId = normalizeCompanyId(srcSegments[0]);
	const srcRelSegments = srcSegments.slice(1);
	const dstRelSegments = [...srcSegments.slice(1, -1), newName];

	await moveSrcToDst(
		companyId,
		srcRelSegments,
		access.node.kind,
		companyId,
		dstRelSegments,
		"infinity",
	);
}

export async function deleteNode(
	viewerEmailRaw: string,
	id: string,
): Promise<void> {
	const access = await getNodeForViewer(viewerEmailRaw, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const s3Key = access.node.storage_key;
	if (!s3Key) return;

	if (access.node.kind === "file") {
		await deleteS3Object(s3Key);
		return;
	}

	const allObjects = await listAllS3Objects(s3Key);
	for (const obj of allObjects) {
		await deleteS3Object(obj.key);
	}
	await deleteS3Object(s3Key).catch(() => {});
}

export async function shareNodeWithUser(): Promise<void> {
	throw new Error(
		"Item-level sharing is disabled. Use company access grants in Settings.",
	);
}

export async function moveNode(
	viewerEmailRaw: string,
	nodeId: string,
	destinationPathRaw: string,
): Promise<void> {
	const access = await getNodeForViewer(viewerEmailRaw, nodeId);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to move this item.");
	}

	const srcPath = decodeNodeId(nodeId);
	if (!srcPath) throw new Error("Invalid source item.");

	const srcSegments = splitPath(srcPath);
	if (srcSegments.length < 2) {
		throw new Error("Company roots cannot be moved.");
	}

	const dstSegments = splitPath(normalizeVirtualPath(destinationPathRaw));
	if (dstSegments.length < 2) {
		throw new Error("Destination must be inside a company folder.");
	}

	const srcCompany = normalizeCompanyId(srcSegments[0]);
	const dstCompany = normalizeCompanyId(dstSegments[0]);
	const dstGrant = await getAccessGrant(viewerEmailRaw, dstCompany);
	if (!dstGrant || !dstGrant.canWrite) {
		throw new Error("You do not have write access to the destination company.");
	}

	await moveSrcToDst(
		srcCompany,
		srcSegments.slice(1),
		access.node.kind,
		dstCompany,
		dstSegments.slice(1),
		"infinity",
	);
}

export async function copyNode(
	viewerEmailRaw: string,
	sourceNodeId: string,
	destinationPathRaw: string,
	options: CopyOptions,
): Promise<string> {
	const source = await getNodeForViewer(viewerEmailRaw, sourceNodeId);
	if (!source) throw new Error("Source item is not accessible.");

	const srcPath = decodeNodeId(sourceNodeId);
	if (!srcPath) throw new Error("Invalid source item.");

	const srcSegments = splitPath(srcPath);
	if (srcSegments.length < 2) {
		throw new Error("Company roots cannot be copied.");
	}

	const dstSegments = splitPath(normalizeVirtualPath(destinationPathRaw));
	if (dstSegments.length < 2) {
		throw new Error("Destination must be inside a company folder.");
	}

	const srcCompany = normalizeCompanyId(srcSegments[0]);
	const dstCompany = normalizeCompanyId(dstSegments[0]);
	const dstGrant = await getAccessGrant(viewerEmailRaw, dstCompany);
	if (!dstGrant || !dstGrant.canWrite) {
		throw new Error("You do not have write access to the destination company.");
	}

	const dstRelSegments = dstSegments.slice(1);
	const dstKey =
		source.node.kind === "file"
			? segmentsToS3Key(dstCompany, dstRelSegments, false)
			: segmentsToS3Key(dstCompany, dstRelSegments, true);

	if (options.overwrite) {
		if (source.node.kind === "file") {
			await deleteS3Object(dstKey).catch(() => {});
		} else {
			const existing = await listAllS3Objects(dstKey);
			for (const obj of existing) {
				await deleteS3Object(obj.key);
			}
		}
	}

	const srcRelSegments = srcSegments.slice(1);
	const srcKey =
		source.node.kind === "file"
			? segmentsToS3Key(srcCompany, srcRelSegments, false)
			: segmentsToS3Key(srcCompany, srcRelSegments, true);

	if (source.node.kind === "file") {
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

	return makeNodeId(`/${dstCompany}/${dstRelSegments.join("/")}`);
}
