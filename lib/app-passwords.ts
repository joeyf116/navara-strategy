import {
	randomBytes,
	randomUUID,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

export type AppPasswordRecord = {
	id: string;
	label: string;
	tokenPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

type StoredPassword = {
	id: string;
	userEmail: string;
	label: string;
	tokenPrefix: string;
	tokenHash: string;
	createdAt: string;
	lastUsedAt: string | null;
	revokedAt: string | null;
};

// ─── S3 / local-filesystem storage ───────────────────────────────────────────

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");
const s3 = filesBucket ? new S3Client({}) : null;

function encodeEmail(email: string): string {
	return encodeURIComponent(email.trim().toLowerCase());
}

function s3PasswordsKey(email: string): string {
	const base = filesBucketPrefix ? `${filesBucketPrefix}/` : "";
	return `${base}.metadata/app-passwords/${encodeEmail(email)}.json`;
}

function localPasswordsPath(email: string): string {
	return path.join(
		process.cwd(),
		"uploads",
		".metadata",
		"app-passwords",
		`${encodeEmail(email)}.json`,
	);
}

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
	throw new Error("Unsupported body type.");
}

async function readPasswords(email: string): Promise<StoredPassword[]> {
	const normalizedEmail = email.trim().toLowerCase();
	if (s3 && filesBucket) {
		try {
			const resp = await s3.send(
				new GetObjectCommand({
					Bucket: filesBucket,
					Key: s3PasswordsKey(normalizedEmail),
				}),
			);
			const buf = await streamToBuffer(resp.Body);
			return JSON.parse(buf.toString("utf8")) as StoredPassword[];
		} catch (err: unknown) {
			if ((err as { name?: string }).name === "NoSuchKey") return [];
			throw err;
		}
	}
	// Local filesystem fallback (dev)
	try {
		const data = await readFile(localPasswordsPath(normalizedEmail), "utf-8");
		return JSON.parse(data) as StoredPassword[];
	} catch {
		return [];
	}
}

async function writePasswords(
	email: string,
	records: StoredPassword[],
): Promise<void> {
	const normalizedEmail = email.trim().toLowerCase();
	const json = JSON.stringify(records);
	if (s3 && filesBucket) {
		await s3.send(
			new PutObjectCommand({
				Bucket: filesBucket,
				Key: s3PasswordsKey(normalizedEmail),
				Body: json,
				ContentType: "application/json",
			}),
		);
		return;
	}
	// Local filesystem fallback (dev)
	const filePath = localPasswordsPath(normalizedEmail);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, json);
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function hashToken(token: string): string {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(token, salt, 64).toString("hex");
	return `${salt}:${hash}`;
}

function verifyToken(token: string, encodedHash: string): boolean {
	const [salt, storedHex] = encodedHash.split(":");
	if (!salt || !storedHex) return false;
	const computed = scryptSync(token, salt, 64);
	const stored = Buffer.from(storedHex, "hex");
	if (stored.length !== computed.length) return false;
	return timingSafeEqual(stored, computed);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createAppPassword(
	userEmailRaw: string,
	labelRaw: string,
): Promise<{ id: string; token: string; tokenPrefix: string }> {
	const userEmail = normalizeEmail(userEmailRaw);
	const label = labelRaw.trim();
	if (!label) throw new Error("Label is required.");

	const rawToken = `nvp_${randomBytes(24).toString("base64url")}`;
	const tokenPrefix = rawToken.slice(0, 12);
	const id = randomUUID();

	const records = await readPasswords(userEmail);
	records.push({
		id,
		userEmail,
		label,
		tokenPrefix,
		tokenHash: hashToken(rawToken),
		createdAt: new Date().toISOString(),
		lastUsedAt: null,
		revokedAt: null,
	});
	await writePasswords(userEmail, records);

	return { id, token: rawToken, tokenPrefix };
}

export async function listAppPasswords(
	userEmailRaw: string,
): Promise<AppPasswordRecord[]> {
	const userEmail = normalizeEmail(userEmailRaw);
	const records = await readPasswords(userEmail);
	return records
		.filter((r) => r.revokedAt == null)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
		.map((r) => ({
			id: r.id,
			label: r.label,
			tokenPrefix: r.tokenPrefix,
			createdAt: r.createdAt,
			lastUsedAt: r.lastUsedAt,
		}));
}

export async function revokeAppPassword(
	userEmailRaw: string,
	id: string,
): Promise<void> {
	const userEmail = normalizeEmail(userEmailRaw);
	const records = await readPasswords(userEmail);
	const updated = records.map((r) =>
		r.id === id && r.revokedAt == null
			? { ...r, revokedAt: new Date().toISOString() }
			: r,
	);
	await writePasswords(userEmail, updated);
}

export async function authenticateBasicAuth(
	authHeader: string | null,
): Promise<{ userEmail: string } | null> {
	if (!authHeader?.startsWith("Basic ")) return null;

	const encoded = authHeader.slice("Basic ".length).trim();
	const decoded = Buffer.from(encoded, "base64").toString("utf8");
	const sep = decoded.indexOf(":");
	if (sep <= 0) return null;

	const username = normalizeEmail(decoded.slice(0, sep));
	const token = decoded.slice(sep + 1);
	if (!token) return null;

	const tokenPrefix = token.slice(0, 12);
	const records = await readPasswords(username);

	let matchedId: string | null = null;
	for (const r of records) {
		if (
			r.tokenPrefix === tokenPrefix &&
			r.revokedAt == null &&
			verifyToken(token, r.tokenHash)
		) {
			matchedId = r.id;
			break;
		}
	}
	if (!matchedId) return null;

	// Update lastUsedAt (best-effort)
	const updated = records.map((r) =>
		r.id === matchedId ? { ...r, lastUsedAt: new Date().toISOString() } : r,
	);
	await writePasswords(username, updated).catch(() => {});

	return { userEmail: username };
}
