import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
	createAppPassword,
	listAppPasswords,
	revokeAppPassword,
} from "@/lib/app-passwords";

function unauthorized() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET() {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	try {
		const passwords = await listAppPasswords(email);
		return NextResponse.json({ passwords });
	} catch (error) {
		console.error("Failed to list app passwords", error);
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

		const created = await createAppPassword(email, label);
		return NextResponse.json(created, { status: 201 });
	} catch (error) {
		console.error("Failed to create app password", error);
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

		await revokeAppPassword(email, id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Failed to revoke app password", error);
		return NextResponse.json(
			{ error: "Could not revoke app password." },
			{ status: 500 },
		);
	}
}
