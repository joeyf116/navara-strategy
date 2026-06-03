import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
	createAppPassword,
	listAppPasswords,
	revokeAppPassword,
} from "@/lib/app-passwords";
import { logger } from "@/lib/logger";

function unauthorized() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	logger.info("api/settings/app-passwords", "GET request", { email });

	try {
		const passwords = await listAppPasswords(email);
		logger.info("api/settings/app-passwords", "GET success", {
			email,
			count: passwords.length,
		});
		return NextResponse.json({ passwords });
	} catch (error) {
		logger.error("api/settings/app-passwords", "Failed to list app passwords", error, { email });
		return NextResponse.json(
			{ error: "Could not load app passwords." },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	try {
		const body = (await request.json().catch(() => null)) as {
			label?: string;
		} | null;

		const label = body?.label?.trim();
		if (!label) {
			return NextResponse.json(
				{ error: "Label is required." },
				{ status: 400 },
			);
		}

		logger.info("api/settings/app-passwords", "POST create", { email, label });
		const created = await createAppPassword(email, label);
		logger.info("api/settings/app-passwords", "POST create success", { email, id: created.id });
		return NextResponse.json(created, { status: 201 });
	} catch (error) {
		logger.error("api/settings/app-passwords", "POST create failed", error, { email });
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not create app password.",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(request: Request) {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	try {
		const body = (await request.json().catch(() => null)) as {
			id?: string;
		} | null;

		const id = body?.id?.trim();
		if (!id) {
			return NextResponse.json(
				{ error: "Password id is required." },
				{ status: 400 },
			);
		}

		logger.info("api/settings/app-passwords", "DELETE revoke", { email, id });
		await revokeAppPassword(email, id);
		logger.info("api/settings/app-passwords", "DELETE revoke success", { email, id });
		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("api/settings/app-passwords", "DELETE revoke failed", error, { email });
		return NextResponse.json(
			{ error: "Could not revoke app password." },
			{ status: 500 },
		);
	}
}
