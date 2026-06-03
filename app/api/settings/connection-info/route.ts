import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const sftpEndpoint = process.env.SFTP_ENDPOINT ?? "";
	const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
	const webdavUrl = appUrl ? `${appUrl}/api/dav` : "";

	return NextResponse.json({
		sftpEndpoint,
		webdavUrl,
		userEmail: email,
	});
}
