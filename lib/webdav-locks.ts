import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

export type ActiveLock = {
	id: string;
	userEmail: string;
	lockPath: string;
	depth: "0" | "infinity";
	owner: string | null;
	token: string;
	timeoutSec: number;
	expiresAt: string;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");
const s3 = filesBucket ? new S3Client({}) : null;

function lockKeyPrefix(): string {
	const base = filesBucketPrefix ? `${filesBucketPrefix}/` : "";
	return `${base}.metadata/locks/`;
}

function s3LockKey(token: string): string {
	return `${lockKeyPrefix()}${token}.json`;
}

function localLocksDir(): string {
	return path.join(process.cwd(), "uploads", ".metadata", "locks");
}

function localLockPath(token: string): string {
	return path.join(localLocksDir(), `${token}.json`);
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

async function readLock(token: string): Promise<ActiveLock | null> {
	if (s3 && filesBucket) {
		try {
			const resp = await s3.send(
				new GetObjectCommand({ Bucket: filesBucket, Key: s3LockKey(token) }),
			);
			const buf = await streamToBuffer(resp.Body);
			return JSON.parse(buf.toString("utf8")) as ActiveLock;
		} catch (err: unknown) {
			if ((err as { name?: string }).name === "NoSuchKey") return null;
			throw err;
		}
	}
	// Local fallback
	try {
		const data = await readFile(localLockPath(token), "utf-8");
		return JSON.parse(data) as ActiveLock;
	} catch {
		return null;
	}
}

async function writeLock(lock: ActiveLock): Promise<void> {
	const json = JSON.stringify(lock);
	if (s3 && filesBucket) {
		await s3.send(
			new PutObjectCommand({
				Bucket: filesBucket,
				Key: s3LockKey(lock.token),
				Body: json,
				ContentType: "application/json",
			}),
		);
		return;
	}
	const dir = localLocksDir();
	await mkdir(dir, { recursive: true });
	await writeFile(localLockPath(lock.token), json);
}

async function deleteLock(token: string): Promise<void> {
	if (s3 && filesBucket) {
		await s3.send(
			new DeleteObjectCommand({ Bucket: filesBucket, Key: s3LockKey(token) }),
		);
		return;
	}
	await unlink(localLockPath(token)).catch(() => {});
}

async function listAllLocks(): Promise<ActiveLock[]> {
	const now = new Date();
	const expired: string[] = [];
	const active: ActiveLock[] = [];

	if (s3 && filesBucket) {
		const prefix = lockKeyPrefix();
		let ct: string | undefined;
		do {
			const resp = await s3.send(
				new ListObjectsV2Command({
					Bucket: filesBucket,
					Prefix: prefix,
					ContinuationToken: ct,
				}),
			);
			for (const obj of resp.Contents ?? []) {
				if (!obj.Key) continue;
				const token = obj.Key.slice(prefix.length).replace(/\.json$/, "");
				const lock = await readLock(token);
				if (!lock) continue;
				if (new Date(lock.expiresAt) <= now) expired.push(lock.token);
				else active.push(lock);
			}
			ct = resp.NextContinuationToken;
		} while (ct);
	} else {
		// Local fallback
		try {
			const dir = localLocksDir();
			const files = await readdir(dir).catch(() => [] as string[]);
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const token = file.slice(0, -5);
				const lock = await readLock(token);
				if (!lock) continue;
				if (new Date(lock.expiresAt) <= now) expired.push(lock.token);
				else active.push(lock);
			}
		} catch {
			// No locks dir yet
		}
	}

	// Clean up expired locks (best-effort)
	for (const token of expired) {
		await deleteLock(token).catch(() => {});
	}

	return active;
}

// ─── Path / token helpers ─────────────────────────────────────────────────────

function normalizePath(rawPath: string): string {
	const parts = rawPath
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean);
	return `/${parts.join("/")}`;
}

function parseIfTokens(ifHeader: string | null): string[] {
	if (!ifHeader) return [];
	const tokens: string[] = [];
	for (const match of ifHeader.matchAll(/<([^>]+)>/g)) {
		if (match[1]) tokens.push(match[1].replace(/^opaquelocktoken:/i, ""));
	}
	return tokens;
}

function parseLockTokenHeader(header: string | null): string | null {
	if (!header) return null;
	return header
		.trim()
		.replace(/^<|>$/g, "")
		.replace(/^opaquelocktoken:/i, "");
}

function lockCoversPath(
	lockPath: string,
	lockDepth: string,
	targetPath: string,
): boolean {
	const normalizedLockPath = normalizePath(lockPath);
	const normalizedTarget = normalizePath(targetPath);
	if (normalizedLockPath === normalizedTarget) return true;
	if (lockDepth === "infinity")
		return normalizedTarget.startsWith(`${normalizedLockPath}/`);
	return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listActiveLocksForPath(
	path: string,
): Promise<ActiveLock[]> {
	const normalizedPath = normalizePath(path);
	const all = await listAllLocks();
	return all.filter((lock) =>
		lockCoversPath(lock.lockPath, lock.depth, normalizedPath),
	);
}

export function extractSubmittedLockTokens(
	ifHeader: string | null,
	lockTokenHeader: string | null,
): string[] {
	const tokens = new Set(parseIfTokens(ifHeader));
	const lockToken = parseLockTokenHeader(lockTokenHeader);
	if (lockToken) tokens.add(lockToken);
	return [...tokens];
}

export async function assertLockPermission(params: {
	path: string;
	userEmail: string;
	ifHeader: string | null;
	lockTokenHeader?: string | null;
}): Promise<{ ok: true } | { ok: false; lockedBy: string }> {
	const locks = await listActiveLocksForPath(params.path);
	if (locks.length === 0) return { ok: true };

	const submittedTokens = new Set(
		extractSubmittedLockTokens(params.ifHeader, params.lockTokenHeader ?? null),
	);

	const violations = locks.filter(
		(lock) =>
			lock.userEmail !== params.userEmail || !submittedTokens.has(lock.token),
	);
	if (violations.length > 0) {
		return { ok: false, lockedBy: violations[0].userEmail };
	}
	return { ok: true };
}

export function parseTimeoutSeconds(timeoutHeader: string | null): number {
	if (!timeoutHeader) return 600;
	const first = timeoutHeader.split(",")[0]?.trim();
	if (!first) return 600;
	if (/^Infinite$/i.test(first)) return 86400;
	const match = /^Second-(\d+)$/i.exec(first);
	if (!match) return 600;
	const parsed = Number(match[1]);
	if (!Number.isFinite(parsed) || parsed <= 0) return 600;
	return Math.min(parsed, 86400);
}

export async function createOrRefreshLock(params: {
	path: string;
	userEmail: string;
	depth: "0" | "infinity";
	owner: string | null;
	timeoutSec: number;
	submittedTokens: string[];
}): Promise<{
	token: string;
	lockPath: string;
	depth: "0" | "infinity";
	timeoutSec: number;
	owner: string | null;
	expiresAt: string;
}> {
	const normalizedPath = normalizePath(params.path);
	const expiresAt = new Date(
		Date.now() + params.timeoutSec * 1000,
	).toISOString();

	if (params.submittedTokens.length > 0) {
		for (const token of params.submittedTokens) {
			const existing = await readLock(token);
			if (!existing) continue;
			if (existing.userEmail !== params.userEmail) {
				throw new Error("Lock token belongs to a different user.");
			}
			const refreshed: ActiveLock = {
				...existing,
				timeoutSec: params.timeoutSec,
				expiresAt,
			};
			await writeLock(refreshed);
			return {
				token: refreshed.token,
				lockPath: refreshed.lockPath,
				depth: refreshed.depth,
				timeoutSec: refreshed.timeoutSec,
				owner: refreshed.owner,
				expiresAt: refreshed.expiresAt,
			};
		}
		throw new Error("Lock token not found.");
	}

	// Create new lock – check for conflicting locks first
	const blocking = await listActiveLocksForPath(normalizedPath);
	if (blocking.some((lock) => lock.userEmail !== params.userEmail)) {
		throw new Error("Resource is already locked by another user.");
	}

	const newLock: ActiveLock = {
		id: randomUUID(),
		userEmail: params.userEmail,
		lockPath: normalizedPath,
		depth: params.depth,
		owner: params.owner,
		token: randomUUID(),
		timeoutSec: params.timeoutSec,
		expiresAt,
	};
	await writeLock(newLock);

	return {
		token: newLock.token,
		lockPath: newLock.lockPath,
		depth: newLock.depth,
		timeoutSec: newLock.timeoutSec,
		owner: newLock.owner,
		expiresAt: newLock.expiresAt,
	};
}

export async function unlockWithToken(params: {
	token: string;
	userEmail: string;
}): Promise<boolean> {
	const existing = await readLock(params.token);
	if (!existing) return false;
	if (existing.userEmail !== params.userEmail) {
		throw new Error("Cannot unlock a lock owned by another user.");
	}
	await deleteLock(params.token);
	return true;
}
