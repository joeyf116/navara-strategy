/**
 * Excel Parser Lambda
 *
 * Triggered by S3 ObjectCreated events under the excel-imports/ prefix.
 * Reads the Excel file as a streaming Node.js ReadableStream — never buffers
 * the full file into memory. Rows are batch-inserted into PostgreSQL in
 * chunks of BATCH_SIZE to stay within memory and transaction limits.
 *
 * Key format expected:  excel-imports/{jobId}/{filename}
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";
import pg from "pg";

const { Client } = pg;
const s3 = new S3Client({});
const BATCH_SIZE = 500;
const MAX_ERROR_TEXT = 1000;

/**
 * Merge a batch of rows into imported_records using a single parameterised
 * INSERT.  Each row contributes 2 parameters: row_index + data.
 */
async function flushBatch(db, jobId, batch) {
	if (batch.length === 0) return;

	// Build: ($1, $2::int, $3::jsonb), ($1, $4::int, $5::jsonb), …
	const placeholders = batch
		.map((_, i) => `($1, $${i * 2 + 2}::integer, $${i * 2 + 3}::jsonb)`)
		.join(", ");

	const params = [jobId];
	for (const { rowIndex, data } of batch) {
		params.push(rowIndex, JSON.stringify(data));
	}

	await db.query(
		`INSERT INTO imported_records (job_id, row_index, data) VALUES ${placeholders}`,
		params,
	);
}

/**
 * Convert an ExcelJS cell value to a plain JS primitive suitable for JSONB.
 */
function cellValue(v) {
	if (v === null || v === undefined) return null;
	if (v instanceof Date) return v.toISOString();
	if (typeof v === "object" && "text" in v) return String(v.text); // RichText
	if (typeof v === "object" && "result" in v) return v.result ?? null; // Formula
	return v;
}

export async function handler(event) {
	const record = event.Records?.[0]?.s3;
	if (!record) {
		console.warn("No S3 record found in event:", JSON.stringify(event));
		return;
	}

	const bucket = record.bucket.name;
	const key = decodeURIComponent(record.object.key.replace(/\+/g, " "));

	// Expected key structure: excel-imports/{jobId}/{filename}
	const parts = key.split("/");
	if (parts.length < 3 || parts[0] !== "excel-imports") {
		console.warn("Skipping unexpected key structure:", key);
		return;
	}

	const jobId = parts[1];

	const db = new Client({ connectionString: process.env.DATABASE_URL });
	await db.connect();

	try {
		// Mark as processing
		await db.query(
			"UPDATE import_jobs SET status = 'processing' WHERE id = $1",
			[jobId],
		);

		// Stream the Excel file directly from S3 — no disk write needed
		const s3Res = await s3.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(
			s3Res.Body, // Node.js Readable provided by the AWS SDK v3 in Lambda
			{
				entries: "emit",
				sharedStrings: "cache", // cache shared strings for memory efficiency
				hyperlinks: "ignore",
				styles: "ignore",
			},
		);

		let totalRows = 0;
		let batch = [];
		let headers = null;

		// Async-iterate worksheets then rows — constant memory regardless of file size
		for await (const worksheet of workbookReader) {
			for await (const row of worksheet) {
				const raw = row.values; // sparse 1-indexed array

				if (row.number === 1) {
					// Treat the first row as headers
					headers = Array.from(
						{ length: raw.length - 1 },
						(_, i) => String(raw[i + 1] ?? "").trim() || `col_${i + 1}`,
					);
					continue;
				}

				const data = {};
				const colCount = Math.max(raw.length - 1, headers ? headers.length : 0);
				for (let i = 0; i < colCount; i++) {
					const col = headers ? (headers[i] ?? `col_${i + 1}`) : `col_${i + 1}`;
					data[col] = cellValue(raw[i + 1]);
				}

				totalRows++;
				batch.push({ rowIndex: row.number, data });

				if (batch.length >= BATCH_SIZE) {
					await flushBatch(db, jobId, batch);
					batch = [];
					console.log(`Flushed batch — total so far: ${totalRows}`);
				}
			}

			// Only process the first worksheet
			break;
		}

		// Flush any remaining rows
		await flushBatch(db, jobId, batch);

		await db.query(
			"UPDATE import_jobs SET status = 'done', row_count = $1, finished_at = NOW() WHERE id = $2",
			[totalRows, jobId],
		);

		console.log(
			`Job ${jobId} completed: ${totalRows} rows imported from ${key}`,
		);
	} catch (err) {
		const errText = String(err?.message ?? err).slice(0, MAX_ERROR_TEXT);
		console.error(`Job ${jobId} failed:`, err);

		await db
			.query(
				"UPDATE import_jobs SET status = 'failed', error_text = $1, finished_at = NOW() WHERE id = $2",
				[errText, jobId],
			)
			.catch((e) => console.error("Failed to update job status:", e));

		throw err; // Re-throw so Lambda records the invocation as failed
	} finally {
		await db.end().catch(() => {});
	}
}
