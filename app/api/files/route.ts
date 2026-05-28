import { NextResponse } from "next/server";

import { createSharedFile, listSharedFiles } from "@/lib/files";

const MAX_FILE_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25) || 25) * 1024 * 1024;

export async function GET() {
  try {
    const files = await listSharedFiles();
    return NextResponse.json({ files });
  } catch (error) {
    console.error("Failed to list files", error);
    return NextResponse.json(
      { error: "Could not load shared files." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const uploadedBy = formData.get("uploadedBy");

    if (!(file instanceof File) || !uploadedBy || typeof uploadedBy !== "string") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const uploaderName = uploadedBy.trim();
    if (!uploaderName) {
      return NextResponse.json({ error: "Uploader name is required." }, { status: 400 });
    }

    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File must be between 1 byte and ${
            MAX_FILE_BYTES / (1024 * 1024)
          }MB.`,
        },
        { status: 400 },
      );
    }

    const created = await createSharedFile({ file, uploadedBy: uploaderName });
    return NextResponse.json({ file: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload file", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
