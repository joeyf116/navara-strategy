import { randomUUID } from "node:crypto";
import path from "node:path";

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import type { VirtualNodeKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function splitPath(rawPath: string) {
	return rawPath
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function buildPath(parts: string[]) {
	return `/${parts.join("/")}`;
}

function normalizeVirtualPath(rawPath: string) {
	const parts = splitPath(rawPath);
	return `/${parts.join("/")}`;
}

function toStoragePath(storageKey: string) {
	return filesBucketPrefix ? `${filesBucketPrefix}/${storageKey}` : storageKey;
}

function mapNode(row: {
	id: string;
	ownerEmail: string;
	parentId: string | null;
	name: string;
	kind: VirtualNodeKind;
	storageKey: string | null;
	sizeBytes: bigint;
	contentType: string | null;
	createdAt: Date;
	updatedAt: Date;
}): VirtualNode {
	return {
		id: row.id,
		owner_email: row.ownerEmail,
		parent_id: row.parentId,
		name: row.name,
		kind: row.kind,
		storage_key: row.storageKey,
		size_bytes: Number(row.sizeBytes),
		content_type: row.contentType,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString(),
	};
}

function toViewerNode(
	node: VirtualNode,
	virtualPath: string,
	canWrite: boolean,
): ViewerNode {
	return {
		id: node.id,
		name: node.name,
		kind: node.kind,
		ownerEmail: node.owner_email,
		sizeBytes: node.size_bytes,
		updatedAt: node.updated_at,
		canWrite,
		virtualPath,
	};
}

async function readS3Body(body: unknown): Promise<Buffer> {
	if (!body) return Buffer.alloc(0);
	if (body instanceof Uint8Array) return Buffer.from(body);

	const maybeTransform = body as {
		transformToByteArray?: () => Promise<Uint8Array>;
	};
	if (typeof maybeTransform.transformToByteArray === "function") {
		return Buffer.from(await maybeTransform.transformToByteArray());
	}

	const asyncBody = body as AsyncIterable<Uint8Array>;
	if (typeof asyncBody[Symbol.asyncIterator] === "function") {
		const chunks: Buffer[] = [];
		for await (const chunk of asyncBody) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}

	throw new Error("Unsupported storage body type.");
}

async function putContent(
	storageKey: string,
	content: Buffer,
	contentType: string,
) {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}

	await s3Client.send(
		new PutObjectCommand({
			Bucket: filesBucket,
			Key: toStoragePath(storageKey),
			Body: content,
			ContentType: contentType || "application/octet-stream",
		}),
	);
}

async function getContent(storageKey: string) {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}

	const response = await s3Client.send(
		new GetObjectCommand({
			Bucket: filesBucket,
			Key: toStoragePath(storageKey),
		}),
	);

	return readS3Body(response.Body);
}

async function deleteContent(storageKey: string) {
	if (!filesBucket || !s3Client) {
		return;
	}

	await s3Client.send(
		new DeleteObjectCommand({
			Bucket: filesBucket,
			Key: toStoragePath(storageKey),
		}),
	);
}

async function copyContent(
	sourceStorageKey: string,
	destinationStorageKey: string,
) {
	if (!filesBucket || !s3Client) {
		throw new Error("FILES_BUCKET is required for virtual file storage.");
	}

	await s3Client.send(
		new CopyObjectCommand({
			Bucket: filesBucket,
			CopySource: `${filesBucket}/${toStoragePath(sourceStorageKey)}`,
			Key: toStoragePath(destinationStorageKey),
		}),
	);
}

export async function ensureVirtualFilesSchema() {
	// Prisma manages schema through migrations.
}

async function findNodeById(id: string) {
	const row = await prisma.virtualFile.findUnique({ where: { id } });
	return row ? mapNode(row) : null;
}

async function findChild(
	ownerEmail: string,
	parentId: string | null,
	name: string,
) {
	const row = await prisma.virtualFile.findFirst({
		where: {
			ownerEmail,
			parentId,
			name: { equals: name, mode: "insensitive" },
		},
	});

	return row ? mapNode(row) : null;
}

async function resolveOwnedPath(ownerEmail: string, segments: string[]) {
	let parentId: string | null = null;
	let lastNode: VirtualNode | null = null;

	for (const segment of segments) {
		const child = await findChild(ownerEmail, parentId, segment);
		if (!child || child.kind !== "folder") {
			return null;
		}

		parentId = child.id;
		lastNode = child;
	}

	return { parentId, node: lastNode };
}

async function listChildren(ownerEmail: string, parentId: string | null) {
	const rows = await prisma.virtualFile.findMany({
		where: { ownerEmail, parentId },
		orderBy: [{ kind: "desc" }, { name: "asc" }],
	});

	return rows.map((row) => mapNode(row));
}

async function getAncestorIds(nodeId: string) {
	const ids: string[] = [];
	let current = await findNodeById(nodeId);

	while (current) {
		ids.push(current.id);
		if (!current.parent_id) {
			break;
		}
		current = await findNodeById(current.parent_id);
	}

	return ids;
}

async function getShareAccess(viewerEmail: string, nodeId: string) {
	const ancestorIds = await getAncestorIds(nodeId);
	if (ancestorIds.length === 0) {
		return { canRead: false, canWrite: false };
	}

	const shares = await prisma.fileShare.findMany({
		where: {
			granteeEmail: viewerEmail,
			nodeId: { in: ancestorIds },
		},
		select: { canWrite: true },
	});

	if (shares.length === 0) {
		return { canRead: false, canWrite: false };
	}

	return {
		canRead: true,
		canWrite: shares.some((share) => share.canWrite),
	};
}

async function getSharesForViewer(viewerEmail: string) {
	const rows = await prisma.fileShare.findMany({
		where: { granteeEmail: viewerEmail },
		include: { node: true },
		orderBy: [{ ownerEmail: "asc" }, { node: { name: "asc" } }],
	});

	return rows.map((row) => ({
		node: mapNode(row.node),
		canWrite: row.canWrite,
		shareOwnerEmail: row.ownerEmail,
	}));
}

async function collectSubtree(nodeId: string) {
	const nodes = new Map<string, VirtualNode>();
	const queue: string[] = [nodeId];

	while (queue.length > 0) {
		const currentId = queue.shift();
		if (!currentId) continue;

		const node = await findNodeById(currentId);
		if (!node) continue;

		nodes.set(node.id, node);

		const children = await prisma.virtualFile.findMany({
			where: { parentId: node.id },
			select: { id: true },
		});

		for (const child of children) {
			if (!nodes.has(child.id)) {
				queue.push(child.id);
			}
		}
	}

	return Array.from(nodes.values());
}

export async function listViewerDirectory(
	viewerEmailRaw: string,
	rawPath: string,
): Promise<ViewerNode[]> {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const segments = splitPath(rawPath || "/");

	if (segments.length === 0) {
		return [
			{
				id: "root-my-files",
				name: "My Files",
				kind: "folder",
				ownerEmail: viewerEmail,
				sizeBytes: 0,
				updatedAt: new Date(0).toISOString(),
				canWrite: true,
				virtualPath: "/My Files",
			},
			{
				id: "root-shared",
				name: "Shared with Me",
				kind: "folder",
				ownerEmail: viewerEmail,
				sizeBytes: 0,
				updatedAt: new Date(0).toISOString(),
				canWrite: false,
				virtualPath: "/Shared with Me",
			},
		];
	}

	if (segments[0] === "My Files") {
		const relative = segments.slice(1);
		const resolved = await resolveOwnedPath(viewerEmail, relative);
		if (!resolved && relative.length > 0) {
			return [];
		}

		const children = await listChildren(
			viewerEmail,
			resolved?.parentId ?? null,
		);
		return children.map((child) =>
			toViewerNode(
				child,
				buildPath(["My Files", ...relative, child.name]),
				true,
			),
		);
	}

	if (segments[0] === "Shared with Me") {
		const shares = await getSharesForViewer(viewerEmail);

		if (segments.length === 1) {
			const owners = [
				...new Set(shares.map((share) => share.shareOwnerEmail)),
			].sort();
			return owners.map((owner) => ({
				id: `shared-owner-${owner}`,
				name: owner,
				kind: "folder",
				ownerEmail: owner,
				sizeBytes: 0,
				updatedAt: new Date(0).toISOString(),
				canWrite: false,
				virtualPath: `/Shared with Me/${owner}`,
			}));
		}

		const owner = segments[1]?.toLowerCase();
		const remaining = segments.slice(2);
		const ownerShares = shares.filter(
			(share) => share.shareOwnerEmail.toLowerCase() === owner,
		);

		if (remaining.length === 0) {
			return ownerShares.map((share) => ({
				id: share.node.id,
				name: share.node.name,
				kind: share.node.kind,
				ownerEmail: share.node.owner_email,
				sizeBytes: share.node.size_bytes,
				updatedAt: share.node.updated_at,
				canWrite: share.canWrite,
				virtualPath: `/Shared with Me/${share.shareOwnerEmail}/${share.node.name}`,
			}));
		}

		const shareRootName = remaining[0];
		const shareRoot = ownerShares.find(
			(share) => share.node.name === shareRootName,
		);
		if (!shareRoot || shareRoot.node.kind !== "folder") {
			return [];
		}

		const nestedSegments = remaining.slice(1);
		const resolved = await resolveOwnedPath(shareRoot.node.owner_email, [
			shareRoot.node.name,
			...nestedSegments,
		]);
		if (!resolved && nestedSegments.length > 0) {
			return [];
		}

		const children = await listChildren(
			shareRoot.node.owner_email,
			resolved?.parentId ?? shareRoot.node.id,
		);

		return children.map((child) => ({
			id: child.id,
			name: child.name,
			kind: child.kind,
			ownerEmail: child.owner_email,
			sizeBytes: child.size_bytes,
			updatedAt: child.updated_at,
			canWrite: shareRoot.canWrite,
			virtualPath: `/Shared with Me/${shareRoot.shareOwnerEmail}/${shareRoot.node.name}/${nestedSegments.concat(child.name).join("/")}`,
		}));
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
		return {
			id: "root",
			name: "/",
			kind: "folder",
			ownerEmail: viewerEmail,
			sizeBytes: 0,
			updatedAt: new Date().toISOString(),
			canWrite: false,
			virtualPath: "/",
		};
	}

	const parentPath = `/${segments.slice(0, -1).join("/")}` || "/";
	const name = segments.at(-1);
	if (!name) {
		return null;
	}

	const siblings = await listViewerDirectory(viewerEmail, parentPath);
	return (
		siblings.find((entry) => entry.name.toLowerCase() === name.toLowerCase()) ??
		null
	);
}

export async function createFolderInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	folderNameRaw: string,
) {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const folderName = folderNameRaw.trim();
	if (!folderName) {
		throw new Error("Folder name is required.");
	}

	const segments = splitPath(targetPath);
	if (segments[0] !== "My Files") {
		throw new Error("Folders can only be created in My Files.");
	}

	const relative = segments.slice(1);
	const resolved = await resolveOwnedPath(viewerEmail, relative);
	if (!resolved && relative.length > 0) {
		throw new Error("Destination path not found.");
	}

	const existing = await findChild(
		viewerEmail,
		resolved?.parentId ?? null,
		folderName,
	);
	if (existing) {
		throw new Error("An item with that name already exists.");
	}

	const created = await prisma.virtualFile.create({
		data: {
			id: randomUUID(),
			ownerEmail: viewerEmail,
			parentId: resolved?.parentId ?? null,
			name: folderName,
			kind: "folder",
		},
	});

	return created.id;
}

export async function uploadFileInMyFiles(
	viewerEmailRaw: string,
	targetPath: string,
	file: File,
) {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const segments = splitPath(targetPath);
	if (segments[0] !== "My Files") {
		throw new Error("Uploads can only target My Files.");
	}

	const relative = segments.slice(1);
	const resolved = await resolveOwnedPath(viewerEmail, relative);
	if (!resolved && relative.length > 0) {
		throw new Error("Destination path not found.");
	}

	const existing = await findChild(
		viewerEmail,
		resolved?.parentId ?? null,
		file.name,
	);
	const bytes = Buffer.from(await file.arrayBuffer());
	const storageKey = `${viewerEmail}/${randomUUID()}${path.extname(file.name).toLowerCase()}`;
	await putContent(storageKey, bytes, file.type || "application/octet-stream");

	if (existing && existing.kind === "file") {
		if (existing.storage_key) {
			await deleteContent(existing.storage_key);
		}

		await prisma.virtualFile.update({
			where: { id: existing.id },
			data: {
				storageKey,
				sizeBytes: BigInt(file.size),
				contentType: file.type || "application/octet-stream",
			},
		});

		return existing.id;
	}

	if (existing) {
		throw new Error("A folder with this name already exists.");
	}

	const created = await prisma.virtualFile.create({
		data: {
			id: randomUUID(),
			ownerEmail: viewerEmail,
			parentId: resolved?.parentId ?? null,
			name: file.name,
			kind: "file",
			storageKey,
			sizeBytes: BigInt(file.size),
			contentType: file.type || "application/octet-stream",
		},
	});

	return created.id;
}

export async function getNodeForViewer(viewerEmailRaw: string, id: string) {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const node = await findNodeById(id);
	if (!node) {
		return null;
	}

	if (normalizeEmail(node.owner_email) === viewerEmail) {
		return { node, canWrite: true };
	}

	const shareAccess = await getShareAccess(viewerEmail, node.id);
	if (!shareAccess.canRead) {
		return null;
	}

	return { node, canWrite: shareAccess.canWrite };
}

export async function downloadNodeContent(viewerEmail: string, id: string) {
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
) {
	const access = await getNodeForViewer(viewerEmailRaw, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const newName = newNameRaw.trim();
	if (!newName) {
		throw new Error("Name is required.");
	}

	const sibling = await findChild(
		access.node.owner_email,
		access.node.parent_id,
		newName,
	);
	if (sibling && sibling.id !== access.node.id) {
		throw new Error("An item with that name already exists.");
	}

	await prisma.virtualFile.update({
		where: { id },
		data: { name: newName },
	});
}

export async function deleteNode(viewerEmailRaw: string, id: string) {
	const access = await getNodeForViewer(viewerEmailRaw, id);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to this item.");
	}

	const subtree = await collectSubtree(id);
	const storageKeys = subtree
		.filter((node) => node.kind === "file" && Boolean(node.storage_key))
		.map((node) => node.storage_key as string);

	for (const storageKey of storageKeys) {
		await deleteContent(storageKey);
	}

	await prisma.virtualFile.delete({ where: { id } });
}

export async function shareNodeWithUser(
	viewerEmailRaw: string,
	nodeId: string,
	granteeEmailRaw: string,
	canWrite: boolean,
) {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const granteeEmail = normalizeEmail(granteeEmailRaw);
	const node = await findNodeById(nodeId);

	if (!node || normalizeEmail(node.owner_email) !== viewerEmail) {
		throw new Error("Only the owner can share this item.");
	}

	await prisma.fileShare.upsert({
		where: {
			nodeId_granteeEmail: {
				nodeId,
				granteeEmail,
			},
		},
		create: {
			id: randomUUID(),
			nodeId,
			ownerEmail: viewerEmail,
			granteeEmail,
			canWrite,
		},
		update: {
			canWrite,
		},
	});
}

export async function moveNode(
	viewerEmailRaw: string,
	nodeId: string,
	destinationPathRaw: string,
) {
	const access = await getNodeForViewer(viewerEmailRaw, nodeId);
	if (!access || !access.canWrite) {
		throw new Error("You do not have write access to move this item.");
	}

	const destinationSegments = splitPath(destinationPathRaw);
	if (destinationSegments[0] !== "My Files") {
		throw new Error("Moves are only supported inside My Files.");
	}

	const newName = destinationSegments.at(-1);
	if (!newName) {
		throw new Error("Destination name is required.");
	}

	const parentSegments = destinationSegments.slice(1, -1);
	const resolved = await resolveOwnedPath(
		access.node.owner_email,
		parentSegments,
	);
	if (!resolved && parentSegments.length > 0) {
		throw new Error("Destination path not found.");
	}

	const sibling = await findChild(
		access.node.owner_email,
		resolved?.parentId ?? null,
		newName,
	);
	if (sibling && sibling.id !== nodeId) {
		throw new Error("Destination already exists.");
	}

	await prisma.virtualFile.update({
		where: { id: nodeId },
		data: {
			parentId: resolved?.parentId ?? null,
			name: newName,
		},
	});
}

async function cloneNodeRecursive(
	sourceNode: VirtualNode,
	destinationOwnerEmail: string,
	destinationParentId: string | null,
	destinationName: string,
	depth: "0" | "infinity",
) {
	let destinationStorageKey: string | null = null;

	if (sourceNode.kind === "file" && sourceNode.storage_key) {
		const extension = path.extname(sourceNode.name).toLowerCase();
		destinationStorageKey = `${destinationOwnerEmail}/${randomUUID()}${extension}`;
		await copyContent(sourceNode.storage_key, destinationStorageKey);
	}

	const created = await prisma.virtualFile.create({
		data: {
			id: randomUUID(),
			ownerEmail: destinationOwnerEmail,
			parentId: destinationParentId,
			name: destinationName,
			kind: sourceNode.kind,
			storageKey: destinationStorageKey,
			sizeBytes: BigInt(sourceNode.size_bytes),
			contentType: sourceNode.content_type,
		},
	});

	if (sourceNode.kind === "folder" && depth === "infinity") {
		const children = await listChildren(sourceNode.owner_email, sourceNode.id);
		for (const child of children) {
			await cloneNodeRecursive(
				child,
				destinationOwnerEmail,
				created.id,
				child.name,
				depth,
			);
		}
	}

	return created.id;
}

export async function copyNode(
	viewerEmailRaw: string,
	sourceNodeId: string,
	destinationPathRaw: string,
	options: CopyOptions,
) {
	const viewerEmail = normalizeEmail(viewerEmailRaw);
	const access = await getNodeForViewer(viewerEmail, sourceNodeId);
	if (!access) {
		throw new Error("Source item is not accessible.");
	}

	const destinationSegments = splitPath(destinationPathRaw);
	if (destinationSegments[0] !== "My Files") {
		throw new Error("COPY destination must be under My Files.");
	}

	const destinationName = destinationSegments.at(-1);
	if (!destinationName) {
		throw new Error("Destination path is invalid.");
	}

	const destinationParentSegments = destinationSegments.slice(1, -1);
	const destinationParent = await resolveOwnedPath(
		viewerEmail,
		destinationParentSegments,
	);
	if (!destinationParent && destinationParentSegments.length > 0) {
		throw new Error("Destination parent path not found.");
	}

	const existing = await findChild(
		viewerEmail,
		destinationParent?.parentId ?? null,
		destinationName,
	);
	if (existing) {
		if (!options.overwrite) {
			throw new Error("Destination already exists and overwrite is disabled.");
		}
		await deleteNode(viewerEmail, existing.id);
	}

	return cloneNodeRecursive(
		access.node,
		viewerEmail,
		destinationParent?.parentId ?? null,
		destinationName,
		options.depth,
	);
}
