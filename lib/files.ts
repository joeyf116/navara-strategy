import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPool } from "@/lib/db";

export type SharedFile = {
  id: string;
  original_name: string;
  storage_key: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
};

const metadataFilePath = path.join(process.cwd(), "uploads", "index.json");

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
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
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

export async function listSharedFiles() {
  await ensureSchema();

  const pool = getPool();
  if (!pool) {
    const records = await readLocalMetadata();
    return records.sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  }

  const { rows } = await pool.query<SharedFile>(
    `SELECT id, original_name, storage_key, size_bytes, uploaded_by, uploaded_at::text
     FROM shared_files
     ORDER BY uploaded_at DESC`,
  );

  return rows;
}

export async function createSharedFile(params: {
  file: File;
  uploadedBy: string;
}) {
  await ensureSchema();

  const id = randomUUID();
  const extension = path
    .extname(path.basename(params.file.name))
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
  const safeExtension = /^\.[a-z0-9]{1,9}$/.test(extension) ? extension : "";
  const storageKey = `${id}${safeExtension}`;

  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const bytes = Buffer.from(await params.file.arrayBuffer());
  await writeFile(path.join(uploadDir, storageKey), bytes);

  const record: SharedFile = {
    id,
    original_name: params.file.name,
    storage_key: storageKey,
    size_bytes: params.file.size,
    uploaded_by: params.uploadedBy,
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
    `INSERT INTO shared_files (id, original_name, storage_key, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      record.id,
      record.original_name,
      record.storage_key,
      record.size_bytes,
      record.uploaded_by,
    ],
  );

  return record;
}
