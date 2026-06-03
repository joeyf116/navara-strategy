import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listCognitoUsers } from "@/lib/company-access";

function unauthorized() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function forbidden() {
	return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;
	const role = session?.user?.role;

	if (!email || !role) {
		return unauthorized();
	}

	if (role !== "super_admin") {
		return forbidden();
	}

	try {
		const users = await listCognitoUsers();
		return NextResponse.json({ users });
	} catch {
		return NextResponse.json(
			{ error: "Could not load Cognito users." },
			{ status: 500 },
		);
	}
}
