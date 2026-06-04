import { NextResponse } from "next/server";
import { Client } from "pg";

import { auth } from "@/lib/auth";
import { resolveUserCompanyAccess } from "@/lib/company-access";

export async function POST() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const companyAccess = await resolveUserCompanyAccess(email);
	if (!companyAccess.isSuperAdmin) {
		return NextResponse.json(
			{ error: "Only super admins can verify database connectivity." },
			{ status: 403 },
		);
	}

	const connectionString = process.env.DATABASE_URL?.trim();
	if (!connectionString) {
		return NextResponse.json(
			{ error: "DATABASE_URL is not configured." },
			{ status: 500 },
		);
	}

	const client = new Client({
		connectionString,
		connectionTimeoutMillis: 8_000,
	});

	try {
		await client.connect();
		const result = await client.query<{
			database: string;
			username: string;
			serverVersion: string;
		}>(
			`SELECT
				current_database() AS "database",
				current_user AS "username",
				version() AS "serverVersion"`,
		);
		const row = result.rows[0];

		return NextResponse.json({
			ok: true,
			database: row?.database ?? "",
			username: row?.username ?? "",
			serverVersion: row?.serverVersion ?? "",
			verifiedAt: new Date().toISOString(),
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Connection failed.";
		return NextResponse.json(
			{ ok: false, error: `Database connection failed: ${message}` },
			{ status: 500 },
		);
	} finally {
		await client.end().catch(() => undefined);
	}
}
