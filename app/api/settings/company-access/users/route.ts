import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
	getUserCompanyAccessForAdmin,
	listCognitoUsers,
} from "@/lib/company-access";

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
		const usersWithGrants = await Promise.all(
			users.map(async (user) => {
				const access = await getUserCompanyAccessForAdmin(user.email).catch(
					() => ({
						isSuperAdmin: false,
						grants: [],
					}),
				);
				return {
					...user,
					grants: access.grants,
				};
			}),
		);
		return NextResponse.json({ users: usersWithGrants });
	} catch {
		return NextResponse.json(
			{ error: "Could not load Cognito users." },
			{ status: 500 },
		);
	}
}
