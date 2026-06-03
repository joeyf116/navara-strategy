import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
	var __prisma: PrismaClient | undefined;
}

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@localhost:5432/postgres";

const adapter = new PrismaPg({ connectionString });

export const prisma =
	global.__prisma ||
	new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	global.__prisma = prisma;
}
