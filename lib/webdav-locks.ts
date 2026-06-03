import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

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

function normalizePath(rawPath: string) {
	const parts = rawPath
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean);
	return `/${parts.join("/")}`;
}

function parseIfTokens(ifHeader: string | null) {
	if (!ifHeader) return [];
	const tokens: string[] = [];
	const matches = ifHeader.matchAll(/<([^>]+)>/g);

	for (const match of matches) {
		if (!match[1]) continue;
		const token = match[1].replace(/^opaquelocktoken:/i, "");
		tokens.push(token);
	}

	return tokens;
}

function parseLockTokenHeader(header: string | null) {
	if (!header) return null;
	const raw = header.trim().replace(/^<|>$/g, "");
	return raw.replace(/^opaquelocktoken:/i, "");
}

function lockCoversPath(
	lockPath: string,
	lockDepth: string,
	targetPath: string,
) {
	const normalizedLockPath = normalizePath(lockPath);
	const normalizedTarget = normalizePath(targetPath);

	if (normalizedLockPath === normalizedTarget) {
		return true;
	}

	if (lockDepth === "infinity") {
		return normalizedTarget.startsWith(`${normalizedLockPath}/`);
	}

	return false;
}

async function purgeExpiredLocks() {
	await prisma.webDavLock.deleteMany({
		where: {
			expiresAt: {
				lte: new Date(),
			},
		},
	});
}

export async function listActiveLocksForPath(path: string) {
	await purgeExpiredLocks();
	const normalizedPath = normalizePath(path);

	const rows = await prisma.webDavLock.findMany({
		where: {
			OR: [
				{ lockPath: normalizedPath },
				{
					depth: "infinity",
					lockPath: {
						startsWith: `${normalizedPath}/`,
					},
				},
			],
		},
	});

	return rows
		.filter((row) => lockCoversPath(row.lockPath, row.depth, normalizedPath))
		.map(
			(row): ActiveLock => ({
				id: row.id,
				userEmail: row.userEmail,
				lockPath: row.lockPath,
				depth: row.depth as "0" | "infinity",
				owner: row.owner,
				token: row.token,
				timeoutSec: row.timeoutSec,
				expiresAt: row.expiresAt.toISOString(),
			}),
		);
}

export function extractSubmittedLockTokens(
	ifHeader: string | null,
	lockTokenHeader: string | null,
) {
	const tokens = new Set(parseIfTokens(ifHeader));
	const lockToken = parseLockTokenHeader(lockTokenHeader);
	if (lockToken) {
		tokens.add(lockToken);
	}

	return [...tokens];
}

export async function assertLockPermission(params: {
	path: string;
	userEmail: string;
	ifHeader: string | null;
	lockTokenHeader?: string | null;
}) {
	const locks = await listActiveLocksForPath(params.path);
	if (locks.length === 0) {
		return { ok: true as const };
	}

	const submittedTokens = new Set(
		extractSubmittedLockTokens(params.ifHeader, params.lockTokenHeader ?? null),
	);

	const violations = locks.filter((lock) => {
		if (lock.userEmail !== params.userEmail) {
			return true;
		}

		return !submittedTokens.has(lock.token);
	});

	if (violations.length > 0) {
		return {
			ok: false as const,
			lockedBy: violations[0].userEmail,
		};
	}

	return { ok: true as const };
}

export function parseTimeoutSeconds(timeoutHeader: string | null) {
	if (!timeoutHeader) return 600;

	const first = timeoutHeader.split(",")[0]?.trim();
	if (!first) return 600;

	if (/^Infinite$/i.test(first)) {
		return 86400;
	}

	const match = /^Second-(\d+)$/i.exec(first);
	if (!match) {
		return 600;
	}

	const parsed = Number(match[1]);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 600;
	}

	return Math.min(parsed, 86400);
}

export async function createOrRefreshLock(params: {
	path: string;
	userEmail: string;
	depth: "0" | "infinity";
	owner: string | null;
	timeoutSec: number;
	submittedTokens: string[];
}) {
	await purgeExpiredLocks();

	const normalizedPath = normalizePath(params.path);
	const now = Date.now();
	const expiresAt = new Date(now + params.timeoutSec * 1000);

	if (params.submittedTokens.length > 0) {
		const existing = await prisma.webDavLock.findFirst({
			where: {
				token: { in: params.submittedTokens },
			},
		});

		if (!existing) {
			throw new Error("Lock token not found.");
		}

		if (existing.userEmail !== params.userEmail) {
			throw new Error("Lock token belongs to a different user.");
		}

		const updated = await prisma.webDavLock.update({
			where: { id: existing.id },
			data: {
				timeoutSec: params.timeoutSec,
				expiresAt,
			},
		});

		return {
			token: updated.token,
			lockPath: updated.lockPath,
			depth: updated.depth as "0" | "infinity",
			timeoutSec: updated.timeoutSec,
			owner: updated.owner,
			expiresAt: updated.expiresAt.toISOString(),
		};
	}

	const blocking = await listActiveLocksForPath(normalizedPath);
	if (blocking.some((lock) => lock.userEmail !== params.userEmail)) {
		throw new Error("Resource is already locked by another user.");
	}

	const created = await prisma.webDavLock.create({
		data: {
			id: randomUUID(),
			userEmail: params.userEmail,
			lockPath: normalizedPath,
			depth: params.depth,
			owner: params.owner,
			token: randomUUID(),
			timeoutSec: params.timeoutSec,
			expiresAt,
		},
	});

	return {
		token: created.token,
		lockPath: created.lockPath,
		depth: created.depth as "0" | "infinity",
		timeoutSec: created.timeoutSec,
		owner: created.owner,
		expiresAt: created.expiresAt.toISOString(),
	};
}

export async function unlockWithToken(params: {
	token: string;
	userEmail: string;
}) {
	await purgeExpiredLocks();

	const existing = await prisma.webDavLock.findUnique({
		where: { token: params.token },
	});

	if (!existing) {
		return false;
	}

	if (existing.userEmail !== params.userEmail) {
		throw new Error("Cannot unlock a lock owned by another user.");
	}

	await prisma.webDavLock.delete({
		where: { id: existing.id },
	});

	return true;
}
