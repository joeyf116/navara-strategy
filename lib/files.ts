import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/types";

export type SharedFileSource =
	| "user_upload"
	| "admin_share"
	| "system_generated";

export type SharedFile = {
	id: string;
	original_name: string;
	storage_key: string;
	size_bytes: number;
	uploaded_by: string;
	uploaded_by_email: string;
	owner_email: string;
	source: SharedFileSource;
	uploaded_at: string;
};

const metadataFilePath = path.join(process.cwd(), "uploads", "index.json");
const localUploadDir = path.join(process.cwd(), "uploads");

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");

const s3Client = filesBucket ? new S3Client({}) : null;

function normalizeEmail(email: string | null | undefined) {
	if (typeof email !== "string") {
		return "";
	}

	return email.trim().toLowerCase();
}

function canManage(role: UserRole) {
	return role === "super_admin" || role === "admin";
}

function toStoragePath(storageKey: string) {
	return filesBucketPrefix ? `${filesBucketPrefix}/${storageKey}` : storageKey;
}

function usingDatabase() {
	return Boolean(process.env.DATABASE_URL);
}

function normalizeLocalRecord(record: Partial<SharedFile>): SharedFile | null {
	if (!record.id || !record.storage_key || !record.original_name) {
		return null;
	}

	const uploadedBy = record.uploaded_by?.trim() || "Unknown uploader";
	const uploadedByEmail = normalizeEmail(record.uploaded_by_email);
	const ownerEmail = normalizeEmail(record.owner_email);
	const fallbackEmail = uploadedBy.includes("@")
		? normalizeEmail(uploadedBy)
		: "";

	return {
		id: record.id,
		original_name: record.original_name,
		storage_key: record.storage_key,
		size_bytes: typeof record.size_bytes === "number" ? record.size_bytes : 0,
		uploaded_by: uploadedBy,
		uploaded_by_email:
			uploadedByEmail || fallbackEmail || "unknown@local.invalid",
		owner_email:
			ownerEmail || uploadedByEmail || fallbackEmail || "unknown@local.invalid",
		source:
			record.source === "admin_share" || record.source === "system_generated"
				? record.source
				: "user_upload",
		uploaded_at: record.uploaded_at || new Date(0).toISOString(),
	};
}

async function readLocalMetadata() {
	try {
		const data = await readFile(metadataFilePath, "utf-8");
		const parsed = JSON.parse(data) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map((record) => normalizeLocalRecord(record as Partial<SharedFile>))
			.filter((record): record is SharedFile => record !== null);
	} catch {
		return [];
	}
}

async function writeLocalMetadata(records: SharedFile[]) {
	await mkdir(path.dirname(metadataFilePath), { recursive: true });
	await writeFile(metadataFilePath, JSON.stringify(records, null, 2));
}

function sortByUploadDateDesc(records: SharedFile[]) {
	return records.sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

function isVisibleToViewer(
	file: SharedFile,
	viewerEmail: string,
	viewerRole: UserRole,
) {
	if (canManage(viewerRole)) {
		return true;
	}

	const normalizedViewer = normalizeEmail(viewerEmail);
	return (
		normalizeEmail(file.owner_email) === normalizedViewer ||
		normalizeEmail(file.uploaded_by_email) === normalizedViewer
	);
}

function mapSharedFileRow(row: {
	id: string;
	originalName: string;
	storageKey: string;
	sizeBytes: bigint;
	uploadedBy: string;
	uploadedByEmail: string;
	ownerEmail: string;
	source: string;
	uploadedAt: Date;
}): SharedFile {
	return {
		id: row.id,
		original_name: row.originalName,
		storage_key: row.storageKey,
		size_bytes: Number(row.sizeBytes),
		uploaded_by: row.uploadedBy,
		uploaded_by_email: row.uploadedByEmail,
		owner_email: row.ownerEmail,
		source:
			row.source === "admin_share" || row.source === "system_generated"
				? row.source
				: "user_upload",
		uploaded_at: row.uploadedAt.toISOString(),
	};
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
	return Boolean(
		value &&
		typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] ===
			"function",
	);
}

async function readS3Body(body: unknown): Promise<Buffer> {
	if (!body) {
		return Buffer.alloc(0);
	}

	if (body instanceof Uint8Array) {
		return Buffer.from(body);
	}

	if (typeof body === "string") {
		return Buffer.from(body);
	}

	const maybeTransform = body as {
		transformToByteArray?: () => Promise<Uint8Array>;
	};
	if (typeof maybeTransform.transformToByteArray === "function") {
		return Buffer.from(await maybeTransform.transformToByteArray());
	}

	if (isAsyncIterable(body)) {
		const chunks: Buffer[] = [];
		for await (const chunk of body) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}

	throw new Error("Unsupported S3 response body type");
}

export async function listSharedFiles(params: {
	viewerEmail: string;
	viewerRole: UserRole;
}) {
	const viewerEmail = normalizeEmail(params.viewerEmail);

	if (!usingDatabase()) {
		const records = await readLocalMetadata();
		return sortByUploadDateDesc(
			records.filter((file) =>
				isVisibleToViewer(file, viewerEmail, params.viewerRole),
			),
		);
	}

	const where = canManage(params.viewerRole)
		? {}
		: {
				OR: [{ ownerEmail: viewerEmail }, { uploadedByEmail: viewerEmail }],
			};

	const rows = await prisma.sharedFile.findMany({
		where,
		orderBy: { uploadedAt: "desc" },
	});

	return rows.map((row) => mapSharedFileRow(row));
}

export async function getSharedFileForViewer(params: {
	id: string;
	viewerEmail: string;
	viewerRole: UserRole;
}) {
	const viewerEmail = normalizeEmail(params.viewerEmail);

	if (!usingDatabase()) {
		const records = await readLocalMetadata();
		const record = records.find((item) => item.id === params.id);

		if (!record || !isVisibleToViewer(record, viewerEmail, params.viewerRole)) {
			return null;
		}

		return record;
	}

	const row = await prisma.sharedFile.findUnique({
		where: { id: params.id },
	});

	if (!row) {
		return null;
	}

	const mapped = mapSharedFileRow(row);
	if (!isVisibleToViewer(mapped, viewerEmail, params.viewerRole)) {
		return null;
	}

	return mapped;
}

export async function createSharedFile(params: {
	file: File;
	uploadedBy: string;
	uploadedByEmail: string;
	ownerEmail: string;
	source: SharedFileSource;
}) {
	const id = randomUUID();
	const extension = path
		.extname(path.basename(params.file.name))
		.toLowerCase()
		.replace(/[^a-z0-9.]/g, "");
	const safeExtension = /^\.[a-z0-9]{1,9}$/.test(extension) ? extension : "";
	const storageKey = `${id}${safeExtension}`;

	const bytes = Buffer.from(await params.file.arrayBuffer());

	if (filesBucket && s3Client) {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: filesBucket,
				Key: toStoragePath(storageKey),
				Body: bytes,
				ContentType: params.file.type || "application/octet-stream",
			}),
		);
	} else {
		await mkdir(localUploadDir, { recursive: true });
		await writeFile(path.join(localUploadDir, storageKey), bytes);
	}

	const record: SharedFile = {
		id,
		original_name: params.file.name,
		storage_key: storageKey,
		size_bytes: params.file.size,
		uploaded_by: params.uploadedBy,
		uploaded_by_email: normalizeEmail(params.uploadedByEmail),
		owner_email: normalizeEmail(params.ownerEmail),
		source: params.source,
		uploaded_at: new Date().toISOString(),
	};

	if (!usingDatabase()) {
		const current = await readLocalMetadata();
		current.unshift(record);
		await writeLocalMetadata(current);
		return record;
	}

	const created = await prisma.sharedFile.create({
		data: {
			id: record.id,
			originalName: record.original_name,
			storageKey: record.storage_key,
			sizeBytes: BigInt(record.size_bytes),
			uploadedBy: record.uploaded_by,
			uploadedByEmail: record.uploaded_by_email,
			ownerEmail: record.owner_email,
			source: record.source,
		},
	});

	return mapSharedFileRow(created);
}

export async function downloadSharedFileContent(file: SharedFile) {
	if (filesBucket && s3Client) {
		const response = await s3Client.send(
			new GetObjectCommand({
				Bucket: filesBucket,
				Key: toStoragePath(file.storage_key),
			}),
		);

		return readS3Body(response.Body);
	}

	return readFile(path.join(localUploadDir, file.storage_key));
}

export function canManageFiles(role: UserRole) {
	return canManage(role);
}
