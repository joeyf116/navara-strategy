import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
	createCognitoUser,
	deleteCognitoUser,
	getUserCompanyAccessForAdmin,
	listCognitoUsers,
	setUserCompanyAccess,
	type CompanyGrant,
} from "@/lib/company-access";

function unauthorized() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function forbidden() {
	return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

function normalizeGrants(raw: unknown): CompanyGrant[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const src = item as Record<string, unknown>;
			const companyId = String(src.companyId ?? "").trim();
			if (!companyId) return null;
			return {
				companyId,
				canWrite: src.canWrite !== false,
			};
		})
		.filter((item): item is CompanyGrant => item !== null);
}

async function requireSuperAdmin() {
	const session = await auth();
	const email = session?.user?.email;
	const role = session?.user?.role;

	if (!email || !role) {
		return { ok: false as const, response: unauthorized() };
	}

	if (role !== "super_admin") {
		return { ok: false as const, response: forbidden() };
	}

	return { ok: true as const };
}

export async function GET() {
	const access = await requireSuperAdmin();
	if (!access.ok) {
		return access.response;
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

export async function POST(request: Request) {
	const access = await requireSuperAdmin();
	if (!access.ok) {
		return access.response;
	}

	const body = (await request.json().catch(() => null)) as {
		email?: string;
		name?: string;
		temporaryPassword?: string;
		grants?: unknown;
	} | null;

	const email = body?.email?.trim().toLowerCase() || "";
	const temporaryPassword = body?.temporaryPassword?.trim() || "";

	if (!email) {
		return NextResponse.json({ error: "email is required." }, { status: 400 });
	}

	if (!temporaryPassword) {
		return NextResponse.json(
			{ error: "temporaryPassword is required." },
			{ status: 400 },
		);
	}

	try {
		const user = await createCognitoUser({
			email,
			name: body?.name,
			temporaryPassword,
		});
		const grants = await setUserCompanyAccess(
			email,
			normalizeGrants(body?.grants),
		);
		return NextResponse.json({ user, grants }, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not create Cognito user.",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(request: Request) {
	const access = await requireSuperAdmin();
	if (!access.ok) {
		return access.response;
	}

	const body = (await request.json().catch(() => null)) as {
		email?: string;
	} | null;
	const email = body?.email?.trim().toLowerCase() || "";

	if (!email) {
		return NextResponse.json({ error: "email is required." }, { status: 400 });
	}

	try {
		const deleted = await deleteCognitoUser(email);
		return NextResponse.json(deleted);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not delete Cognito user.",
			},
			{ status: 500 },
		);
	}
}
