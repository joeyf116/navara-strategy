import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { downloadSharedFileContent, getSharedFileForViewer } from "@/lib/files";

function buildDownloadFilename(name: string) {
  return name.replace(/[\r\n"]/g, "_");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const user = session?.user;

    if (!user?.email || !user.role) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const file = await getSharedFileForViewer({
      id,
      viewerEmail: user.email,
      viewerRole: user.role,
    });

    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const content = await downloadSharedFileContent(file);
    const safeFileName = buildDownloadFilename(file.original_name);

    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to download file", error);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
