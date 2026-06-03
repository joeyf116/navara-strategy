import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

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
const ssl =
	process.env.NODE_ENV === "production"
		? {
				rejectUnauthorized:
					process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
				...(process.env.DATABASE_CA_CERT
					? {
							ca: Buffer.from(process.env.DATABASE_CA_CERT, "base64").toString(
								"utf8",
							),
						}
					: {}),
			}
		: undefined;

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
