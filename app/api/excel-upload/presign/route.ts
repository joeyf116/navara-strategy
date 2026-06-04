import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createJob, ensureSchema } from "@/lib/excel-upload";

const s3 = new S3Client({});
const BUCKET = process.env.FILES_BUCKET?.trim() ?? "";
const MAX_BYTES = 1_073_741_824; // 1 GiB
const PRESIGN_EXPIRY_SECONDS = 3_600; // 1 hour

function mimeForExtension(ext: string): string {
	return ext === "xlsx"
		? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		: "application/vnd.ms-excel";
}

export async function POST(request: Request) {
	const session = await auth();
	if (!session?.user?.email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	if (!BUCKET) {
		return NextResponse.json(
			{ error: "File storage is not configured." },
			{ status: 503 },
		);
	}

	if (!process.env.DATABASE_URL) {
		return NextResponse.json(
			{ error: "Database is not configured." },
			{ status: 503 },
		);
	}

	const body = (await request.json().catch(() => null)) as {
		filename?: string;
		size?: number;
	} | null;

	const filename = String(body?.filename ?? "").trim();
	const size = Number(body?.size ?? 0);

	if (!filename) {
		return NextResponse.json(
			{ error: "filename is required." },
			{ status: 400 },
		);
	}

	const ext = filename.toLowerCase().split(".").pop() ?? "";
	if (ext !== "xlsx" && ext !== "xls") {
		return NextResponse.json(
			{ error: "Only .xlsx and .xls files are accepted." },
			{ status: 400 },
		);
	}

	if (size > MAX_BYTES) {
		return NextResponse.json(
			{
				error: `File exceeds the 1 GB limit (received ${(size / 1_073_741_824).toFixed(2)} GB).`,
			},
			{ status: 413 },
		);
	}

	const jobId = randomUUID();
	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	const s3Key = `excel-imports/${jobId}/${safeFilename}`;
	const contentType = mimeForExtension(ext);

	try {
		await ensureSchema();
		await createJob({
			id: jobId,
			filename,
			s3Key,
			createdBy: session.user.email,
		});

		const uploadUrl = await getSignedUrl(
			s3,
			new PutObjectCommand({
				Bucket: BUCKET,
				Key: s3Key,
				ContentType: contentType,
			}),
			{ expiresIn: PRESIGN_EXPIRY_SECONDS },
		);

		return NextResponse.json({ jobId, uploadUrl, contentType });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to create upload session.",
			},
			{ status: 500 },
		);
	}
}
