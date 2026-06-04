import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
	if (pool) return pool;
	const connectionString = process.env.DATABASE_URL?.trim();
	if (!connectionString) {
		throw new Error(
			"DATABASE_URL is not configured. Add it to .env.local for local development.",
		);
	}
	pool = new Pool({
		connectionString,
		max: 5,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000,
	});
	return pool;
}

/** Create tables if they do not already exist (idempotent). */
export async function ensureSchema(): Promise<void> {
	const db = getPool();
	await db.query(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      filename    TEXT        NOT NULL,
      s3_key      TEXT        NOT NULL,
      status      TEXT        NOT NULL DEFAULT 'pending',
      row_count   INTEGER,
      error_text  TEXT,
      created_by  TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS imported_records (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id      UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
      row_index   INTEGER     NOT NULL,
      data        JSONB       NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS imported_records_job_id_idx
      ON imported_records (job_id);
  `);
}

export type JobStatus = "pending" | "processing" | "done" | "failed";

export type ImportJob = {
	id: string;
	filename: string;
	s3Key: string;
	status: JobStatus;
	rowCount: number | null;
	errorText: string | null;
	createdBy: string;
	createdAt: string;
	finishedAt: string | null;
};

export async function createJob(params: {
	id: string;
	filename: string;
	s3Key: string;
	createdBy: string;
}): Promise<void> {
	const db = getPool();
	await db.query(
		"INSERT INTO import_jobs (id, filename, s3_key, created_by) VALUES ($1, $2, $3, $4)",
		[params.id, params.filename, params.s3Key, params.createdBy],
	);
}

export async function getJob(id: string): Promise<ImportJob | null> {
	const db = getPool();
	const { rows } = await db.query(
		`SELECT id, filename, s3_key, status, row_count, error_text,
            created_by, created_at, finished_at
     FROM import_jobs WHERE id = $1`,
		[id],
	);
	const row = rows[0];
	if (!row) return null;
	return {
		id: String(row.id),
		filename: String(row.filename),
		s3Key: String(row.s3_key),
		status: row.status as JobStatus,
		rowCount: row.row_count != null ? Number(row.row_count) : null,
		errorText: row.error_text != null ? String(row.error_text) : null,
		createdBy: String(row.created_by),
		createdAt: (row.created_at as Date).toISOString(),
		finishedAt:
			row.finished_at != null ? (row.finished_at as Date).toISOString() : null,
	};
}

export async function listRecentJobs(
	createdBy: string,
	limit = 20,
): Promise<ImportJob[]> {
	const db = getPool();
	const { rows } = await db.query(
		`SELECT id, filename, s3_key, status, row_count, error_text,
            created_by, created_at, finished_at
     FROM import_jobs
     WHERE created_by = $1
     ORDER BY created_at DESC
     LIMIT $2`,
		[createdBy, limit],
	);
	return rows.map((row: Record<string, unknown>) => ({
		id: String(row.id),
		filename: String(row.filename),
		s3Key: String(row.s3_key),
		status: row.status as JobStatus,
		rowCount: row.row_count != null ? Number(row.row_count) : null,
		errorText: row.error_text != null ? String(row.error_text) : null,
		createdBy: String(row.created_by),
		createdAt: (row.created_at as Date).toISOString(),
		finishedAt:
			row.finished_at != null ? (row.finished_at as Date).toISOString() : null,
	}));
}
