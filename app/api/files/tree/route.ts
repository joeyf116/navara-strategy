import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
	createFolderInMyFiles,
	deleteNode,
	listViewerDirectory,
	renameNode,
	shareNodeWithUser,
	uploadFileInMyFiles,
} from "@/lib/virtual-files";

function unauthorized() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET(request: Request) {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	const url = new URL(request.url);
	const path = url.searchParams.get("path") ?? "/";

	logger.info("api/files/tree", "GET request", { email, path });

	try {
		const entries = await listViewerDirectory(email, path);
		logger.info("api/files/tree", "GET success", {
			email,
			path,
			count: entries.length,
		});
		return NextResponse.json({ path, entries });
	} catch (error) {
		logger.error("api/files/tree", "GET failed", error, { email, path });
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Could not load directory.",
			},
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
		const contentType = request.headers.get("content-type") || "";

		if (contentType.includes("multipart/form-data")) {
			const formData = await request.formData();
			const file = formData.get("file");
			const targetPath = String(formData.get("path") ?? "/My Files");

			if (!(file instanceof File)) {
				return NextResponse.json(
					{ error: "File is required." },
					{ status: 400 },
				);
			}

			const id = await uploadFileInMyFiles(email, targetPath, file);
			return NextResponse.json({ id }, { status: 201 });
		}

		const body = (await request.json().catch(() => null)) as {
			action?: "createFolder" | "share";
			path?: string;
			name?: string;
			nodeId?: string;
			granteeEmail?: string;
			canWrite?: boolean;
		} | null;

		if (body?.action === "createFolder") {
			const parentPath = body.path ?? "/My Files";
			const name = body.name?.trim() || "";
			if (!name) {
				return NextResponse.json(
					{ error: "Folder name is required." },
					{ status: 400 },
				);
			}

			const id = await createFolderInMyFiles(email, parentPath, name);
			return NextResponse.json({ id }, { status: 201 });
		}

		if (body?.action === "share") {
			const nodeId = body.nodeId?.trim() || "";
			const granteeEmail = body.granteeEmail?.trim() || "";

			if (!nodeId || !granteeEmail) {
				return NextResponse.json(
					{ error: "nodeId and granteeEmail are required." },
					{ status: 400 },
				);
			}

			await shareNodeWithUser(
				email,
				nodeId,
				granteeEmail,
				Boolean(body.canWrite),
			);
			return NextResponse.json({ ok: true });
		}

		return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
	} catch (error) {
		logger.error("api/files/tree", "POST failed", error, { email });
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "File operation failed.",
			},
			{ status: 500 },
		);
	}
}

export async function PATCH(request: Request) {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return unauthorized();
	}

	try {
		const body = (await request.json().catch(() => null)) as {
			id?: string;
			name?: string;
		} | null;

		const id = body?.id?.trim() || "";
		const name = body?.name?.trim() || "";
		if (!id || !name) {
			return NextResponse.json(
				{ error: "id and name are required." },
				{ status: 400 },
			);
		}

		await renameNode(email, id, name);
		logger.info("api/files/tree", "PATCH rename success", { email, id, name });
		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("api/files/tree", "PATCH rename failed", error, { email });
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Rename failed." },
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
		const url = new URL(request.url);
		const id = url.searchParams.get("id")?.trim() || "";

		if (!id) {
			return NextResponse.json({ error: "id is required." }, { status: 400 });
		}

		await deleteNode(email, id);
		logger.info("api/files/tree", "DELETE success", { email, id });
		return NextResponse.json({ ok: true });
	} catch (error) {
		const url2 = new URL(request.url);
		const nodeId = url2.searchParams.get("id")?.trim() || "(unknown)";
		logger.error("api/files/tree", "DELETE failed", error, {
			email,
			id: nodeId,
		});
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Delete failed." },
			{ status: 500 },
		);
	}
}
