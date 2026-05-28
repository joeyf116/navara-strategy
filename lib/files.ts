import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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

const memoryStore: SharedFile[] = [];
let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  const pool = getPool();
  if (!pool) {
    schemaReady = true;
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
  schemaReady = true;
}

export async function listSharedFiles() {
  await ensureSchema();

  const pool = getPool();
  if (!pool) {
    return [...memoryStore].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
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
  const safeName = path
    .basename(params.file.name)
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${id}-${safeName}`;

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
    memoryStore.unshift(record);
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
