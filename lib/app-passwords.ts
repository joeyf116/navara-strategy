import {
	randomBytes,
	randomUUID,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";

import { prisma } from "@/lib/prisma";

export type AppPasswordRecord = {
	id: string;
	label: string;
	tokenPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function hashToken(token: string) {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(token, salt, 64).toString("hex");
	return `${salt}:${hash}`;
}

function verifyToken(token: string, encodedHash: string) {
	const [salt, storedHex] = encodedHash.split(":");
	if (!salt || !storedHex) return false;

	const computed = scryptSync(token, salt, 64);
	const stored = Buffer.from(storedHex, "hex");
	if (stored.length !== computed.length) return false;

	return timingSafeEqual(stored, computed);
}

export async function ensureAppPasswordSchema() {
	// Prisma manages schema through migrations.
}

export async function createAppPassword(
	userEmailRaw: string,
	labelRaw: string,
) {
	const userEmail = normalizeEmail(userEmailRaw);
	const label = labelRaw.trim();
	if (!label) throw new Error("Label is required.");

	const rawToken = `nvp_${randomBytes(24).toString("base64url")}`;
	const tokenPrefix = rawToken.slice(0, 12);

	const created = await prisma.appPassword.create({
		data: {
			id: randomUUID(),
			userEmail,
			label,
			tokenPrefix,
			tokenHash: hashToken(rawToken),
		},
	});

	return { id: created.id, token: rawToken, tokenPrefix };
}

export async function listAppPasswords(
	userEmailRaw: string,
): Promise<AppPasswordRecord[]> {
	const userEmail = normalizeEmail(userEmailRaw);
	const rows = await prisma.appPassword.findMany({
		where: {
			userEmail,
			revokedAt: null,
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return rows.map((row) => ({
		id: row.id,
		label: row.label,
		tokenPrefix: row.tokenPrefix,
		createdAt: row.createdAt.toISOString(),
		lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
	}));
}

export async function revokeAppPassword(userEmailRaw: string, id: string) {
	const userEmail = normalizeEmail(userEmailRaw);

	await prisma.appPassword.updateMany({
		where: {
			id,
			userEmail,
			revokedAt: null,
		},
		data: {
			revokedAt: new Date(),
		},
	});
}

export async function authenticateBasicAuth(authHeader: string | null) {
	if (!authHeader || !authHeader.startsWith("Basic ")) {
		return null;
	}

	const encoded = authHeader.slice("Basic ".length).trim();
	const decoded = Buffer.from(encoded, "base64").toString("utf8");
	const separator = decoded.indexOf(":");

	if (separator <= 0) return null;

	const username = normalizeEmail(decoded.slice(0, separator));
	const token = decoded.slice(separator + 1);
	if (!token) return null;

	const tokenPrefix = token.slice(0, 12);
	const rows = await prisma.appPassword.findMany({
		where: {
			userEmail: username,
			tokenPrefix,
			revokedAt: null,
		},
		orderBy: {
			createdAt: "desc",
		},
		select: {
			id: true,
			tokenHash: true,
		},
	});

	for (const row of rows) {
		if (!verifyToken(token, row.tokenHash)) {
			continue;
		}

		await prisma.appPassword.update({
			where: { id: row.id },
			data: { lastUsedAt: new Date() },
		});

		return { userEmail: username };
	}

	return null;
}
