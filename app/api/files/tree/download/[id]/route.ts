import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { downloadNodeContent } from "@/lib/virtual-files";

function safeName(name: string) {
	return name.replace(/[\r\n"]/g, "_");
}

export async function GET(
	_request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const session = await auth();
	const email = session?.user?.email;

	if (!email) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	try {
		const { id } = await context.params;
		const file = await downloadNodeContent(email, id);

		if (!file) {
			return NextResponse.json({ error: "File not found." }, { status: 404 });
		}

		const fileName = safeName(file.fileName);
		return new NextResponse(new Uint8Array(file.content), {
			status: 200,
			headers: {
				"Content-Type": file.contentType,
				"Content-Length": String(file.content.byteLength),
				"Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
			},
		});
	} catch (error) {
		console.error("Failed to download virtual file", error);
		return NextResponse.json({ error: "Download failed." }, { status: 500 });
	}
}
