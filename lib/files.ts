import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getPool } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export type SharedFileSource = "user_upload" | "admin_share" | "system_generated";

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
const filesBucketPrefix = (process.env.FILES_BUCKET_PREFIX?.trim() || "portal-files").replace(
  /^\/+|\/+$/g,
  "",
);

const s3Client = filesBucket ? new S3Client({}) : null;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function canManage(role: UserRole) {
  return role === "super_admin" || role === "admin";
}

function toStoragePath(storageKey: string) {
  return filesBucketPrefix ? `${filesBucketPrefix}/${storageKey}` : storageKey;
}

async function ensureSchema() {
  const pool = getPool();
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_files (
      id UUID PRIMARY KEY,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_by_email TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user_upload',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT`);
  await pool.query(`ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS owner_email TEXT`);
  await pool.query(`ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS source TEXT`);

  await pool.query(`
    UPDATE shared_files
    SET
      uploaded_by_email = COALESCE(uploaded_by_email, 'unknown@local.invalid'),
      owner_email = COALESCE(owner_email, 'unknown@local.invalid'),
      source = COALESCE(source, 'user_upload')
    WHERE uploaded_by_email IS NULL
      OR owner_email IS NULL
      OR source IS NULL
  `);

  await pool.query(`ALTER TABLE shared_files ALTER COLUMN uploaded_by_email SET NOT NULL`);
  await pool.query(`ALTER TABLE shared_files ALTER COLUMN owner_email SET NOT NULL`);
  await pool.query(`ALTER TABLE shared_files ALTER COLUMN source SET NOT NULL`);
}

async function readLocalMetadata() {
  try {
    const data = await readFile(metadataFilePath, "utf-8");
    return JSON.parse(data) as SharedFile[];
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

function isVisibleToViewer(file: SharedFile, viewerEmail: string, viewerRole: UserRole) {
  if (canManage(viewerRole)) {
    return true;
  }

  const normalizedViewer = normalizeEmail(viewerEmail);
  return (
    normalizeEmail(file.owner_email) === normalizedViewer ||
    normalizeEmail(file.uploaded_by_email) === normalizedViewer
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return Boolean(value && typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] === "function");
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

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
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

export async function listSharedFiles(params: { viewerEmail: string; viewerRole: UserRole }) {
  await ensureSchema();

  const viewerEmail = normalizeEmail(params.viewerEmail);
  const pool = getPool();

  if (!pool) {
    const records = await readLocalMetadata();
    return sortByUploadDateDesc(
      records.filter((file) => isVisibleToViewer(file, viewerEmail, params.viewerRole)),
    );
  }

  if (canManage(params.viewerRole)) {
    const { rows } = await pool.query<SharedFile>(
      `SELECT id, original_name, storage_key, size_bytes, uploaded_by, uploaded_by_email, owner_email, source, uploaded_at::text
       FROM shared_files
       ORDER BY uploaded_at DESC`,
    );
    return rows;
  }

  const { rows } = await pool.query<SharedFile>(
    `SELECT id, original_name, storage_key, size_bytes, uploaded_by, uploaded_by_email, owner_email, source, uploaded_at::text
     FROM shared_files
     WHERE owner_email = $1 OR uploaded_by_email = $1
     ORDER BY uploaded_at DESC`,
    [viewerEmail],
  );

  return rows;
}

export async function getSharedFileForViewer(params: {
  id: string;
  viewerEmail: string;
  viewerRole: UserRole;
}) {
  await ensureSchema();

  const viewerEmail = normalizeEmail(params.viewerEmail);
  const pool = getPool();

  if (!pool) {
    const records = await readLocalMetadata();
    const record = records.find((item) => item.id === params.id);

    if (!record || !isVisibleToViewer(record, viewerEmail, params.viewerRole)) {
      return null;
    }

    return record;
  }

  const { rows } = await pool.query<SharedFile>(
    `SELECT id, original_name, storage_key, size_bytes, uploaded_by, uploaded_by_email, owner_email, source, uploaded_at::text
     FROM shared_files
     WHERE id = $1
     LIMIT 1`,
    [params.id],
  );

  const record = rows[0];
  if (!record) {
    return null;
  }

  if (!isVisibleToViewer(record, viewerEmail, params.viewerRole)) {
    return null;
  }

  return record;
}

export async function createSharedFile(params: {
  file: File;
  uploadedBy: string;
  uploadedByEmail: string;
  ownerEmail: string;
  source: SharedFileSource;
}) {
  await ensureSchema();

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

  const pool = getPool();
  if (!pool) {
    const current = await readLocalMetadata();
    current.unshift(record);
    await writeLocalMetadata(current);
    return record;
  }

  await pool.query(
    `INSERT INTO shared_files (id, original_name, storage_key, size_bytes, uploaded_by, uploaded_by_email, owner_email, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.id,
      record.original_name,
      record.storage_key,
      record.size_bytes,
      record.uploaded_by,
      record.uploaded_by_email,
      record.owner_email,
      record.source,
    ],
  );

  return record;
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
