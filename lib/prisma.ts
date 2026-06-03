import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { logger } from "@/lib/logger";

declare global {
	var __prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === "production") {
	throw new Error("DATABASE_URL environment variable is not set.");
}

// In development fall back to local postgres if no DATABASE_URL is configured.
const resolvedConnectionString =
	connectionString ?? "postgresql://postgres:postgres@localhost:5432/postgres";

// Enable SSL for production RDS connections.
// DATABASE_SSL_REJECT_UNAUTHORIZED defaults to true; set to "false" for
// self-signed / Aurora certificates where full chain validation isn't possible.
const sslRejectUnauthorized =
	process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const ssl =
	process.env.NODE_ENV === "production"
		? {
				rejectUnauthorized: sslRejectUnauthorized,
				...(process.env.DATABASE_CA_CERT
					? {
							ca: Buffer.from(process.env.DATABASE_CA_CERT, "base64").toString(
								"utf8",
							),
						}
					: {}),
			}
		: undefined;

// Log connection config at startup (password is redacted by the logger).
logger.info("prisma", "Initialising Prisma client", {
	env: process.env.NODE_ENV,
	databaseUrl: resolvedConnectionString,
	sslEnabled: ssl !== undefined,
	sslRejectUnauthorized: ssl ? sslRejectUnauthorized : null,
	hasCaCert: Boolean(process.env.DATABASE_CA_CERT),
	singleton: global.__prisma !== undefined,
});

const adapter = new PrismaPg({
	connectionString: resolvedConnectionString,
	ssl,
});

export const prisma =
	global.__prisma ??
	new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	global.__prisma = prisma;
}
