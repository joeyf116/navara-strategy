import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveUserCompanyAccess } from "@/lib/company-access";

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const sftpEndpoint = process.env.SFTP_ENDPOINT ?? "";
	const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
	const webdavUrl = appUrl ? `${appUrl}/api/dav` : "";
	const companyAccess = await resolveUserCompanyAccess(email);

	return NextResponse.json({
		sftpEndpoint,
		webdavUrl,
		userEmail: email,
		companies: companyAccess.grants.map((grant) => grant.companyId),
		isSuperAdmin: companyAccess.isSuperAdmin,
	});
}
