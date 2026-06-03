import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
	createCompanyAndAssignUsers,
	getUserCompanyAccessForAdmin,
	listAllCompanies,
	resolveUserCompanyAccess,
	setBulkUserCompanyAccess,
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

export async function GET(request: Request) {
	const session = await auth();
	const email = session?.user?.email;
	const role = session?.user?.role;
	if (!email || !role) {
		return unauthorized();
	}

	const url = new URL(request.url);
	const userEmail = url.searchParams.get("userEmail")?.trim().toLowerCase();

	const [allCompanies, currentUserAccess] = await Promise.all([
		listAllCompanies(),
		resolveUserCompanyAccess(email),
	]);

	if (userEmail && role !== "super_admin") {
		return forbidden();
	}

	if (userEmail && role === "super_admin") {
		const target = await getUserCompanyAccessForAdmin(userEmail);
		return NextResponse.json({
			allCompanies,
			currentUser: currentUserAccess,
			targetUser: {
				email: userEmail,
				...target,
			},
		});
	}

	return NextResponse.json({
		allCompanies,
		currentUser: currentUserAccess,
	});
}

export async function POST(request: Request) {
	const session = await auth();
	const actorEmail = session?.user?.email;
	const role = session?.user?.role;

	if (!actorEmail || !role) {
		return unauthorized();
	}

	const body = (await request.json().catch(() => null)) as {
		action?: "createCompany" | "setUserAccess" | "setBulkUserAccess";
		companyId?: string;
		grantUserEmails?: unknown;
		userEmail?: string;
		userEmails?: unknown;
		grants?: unknown;
	} | null;

	if (body?.action === "createCompany") {
		if (role !== "super_admin") return forbidden();
		const companyId = body.companyId?.trim() || "";
		if (!companyId) {
			return NextResponse.json(
				{ error: "companyId is required." },
				{ status: 400 },
			);
		}
		const grantUserEmails = Array.isArray(body.grantUserEmails)
			? body.grantUserEmails
					.map((value) =>
						String(value ?? "")
							.trim()
							.toLowerCase(),
					)
					.filter(Boolean)
			: [];
		const created = await createCompanyAndAssignUsers(
			companyId,
			grantUserEmails,
		);
		return NextResponse.json(created, { status: 201 });
	}

	if (body?.action === "setUserAccess") {
		if (role !== "super_admin") return forbidden();

		const userEmail = body.userEmail?.trim().toLowerCase() || "";
		if (!userEmail) {
			return NextResponse.json(
				{ error: "userEmail is required." },
				{ status: 400 },
			);
		}

		const grants = normalizeGrants(body.grants);
		const updated = await setUserCompanyAccess(userEmail, grants);
		return NextResponse.json({ userEmail, grants: updated });
	}

	if (body?.action === "setBulkUserAccess") {
		if (role !== "super_admin") return forbidden();

		const userEmails = Array.isArray(body.userEmails)
			? body.userEmails
					.map((value) =>
						String(value ?? "")
							.trim()
							.toLowerCase(),
					)
					.filter(Boolean)
			: [];

		if (userEmails.length === 0) {
			return NextResponse.json(
				{ error: "userEmails is required." },
				{ status: 400 },
			);
		}

		const grants = normalizeGrants(body.grants);
		const updatedUsers = await setBulkUserCompanyAccess(userEmails, grants);
		return NextResponse.json({ updatedUsers });
	}

	return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
