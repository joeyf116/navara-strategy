import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveUserCompanyAccess } from "@/lib/company-access";

type DatabaseConnectionInfo = {
	host: string;
	port: string;
	database: string;
	username: string;
	password: string;
	sslMode: string;
	connectionString: string;
};

function buildDatabaseConnectionInfo(): DatabaseConnectionInfo | null {
	const raw = process.env.DATABASE_URL?.trim() ?? "";
	if (!raw) return null;

	try {
		const parsed = new URL(raw);
		const databasePath = parsed.pathname.replace(/^\/+/, "");
		return {
			host: parsed.hostname,
			port: parsed.port || "5432",
			database: databasePath || "postgres",
			username: decodeURIComponent(parsed.username || ""),
			password: decodeURIComponent(parsed.password || ""),
			sslMode: parsed.searchParams.get("sslmode") ?? "require",
			connectionString: raw,
		};
	} catch {
		return null;
	}
}

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const sftpEndpoint = process.env.SFTP_ENDPOINT ?? "";
	const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
	// WEBDAV_URL is set explicitly in Terraform (defaults to Lambda Function URL)
	// so that the WebDAV path bypasses CloudFront's method-validation layer when
	// the Lambda@Edge behavior hasn't been deployed yet.
	const webdavUrl =
		process.env.WEBDAV_URL?.trim() || (appUrl ? `${appUrl}/api/dav` : "");
	const companyAccess = await resolveUserCompanyAccess(email);
	const database = companyAccess.isSuperAdmin
		? buildDatabaseConnectionInfo()
		: null;

	return NextResponse.json({
		sftpEndpoint,
		webdavUrl,
		userEmail: email,
		companies: companyAccess.grants.map((grant) => grant.companyId),
		isSuperAdmin: companyAccess.isSuperAdmin,
		database,
	});
}
