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

const adapter = new PrismaPg({ connectionString: resolvedConnectionString });

export const prisma =
	global.__prisma ??
	new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	global.__prisma = prisma;
}
