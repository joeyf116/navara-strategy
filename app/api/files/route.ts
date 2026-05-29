import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { canManageFiles, createSharedFile, listSharedFiles } from "@/lib/files";

const MAX_FILE_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25) || 25) * 1024 * 1024;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user;

    if (!user?.email || !user.role) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const files = await listSharedFiles({
      viewerEmail: user.email,
      viewerRole: user.role,
    });

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
    const session = await auth();
    const user = session?.user;

    if (!user?.email || !user.role) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const targetUserEmailRaw = formData.get("targetUserEmail");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing required file." }, { status: 400 });
    }

    const viewerEmail = user.email.trim().toLowerCase();
    const canManage = canManageFiles(user.role);
    const targetUserEmail =
      typeof targetUserEmailRaw === "string" && targetUserEmailRaw.trim().length > 0
        ? targetUserEmailRaw.trim().toLowerCase()
        : viewerEmail;

    if (!EMAIL_REGEX.test(targetUserEmail)) {
      return NextResponse.json({ error: "Target user email is invalid." }, { status: 400 });
    }

    if (!canManage && targetUserEmail !== viewerEmail) {
      return NextResponse.json(
        { error: "You can only upload files to your own portal." },
        { status: 403 },
      );
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

    const created = await createSharedFile({
      file,
      uploadedBy: user.name?.trim() || viewerEmail,
      uploadedByEmail: viewerEmail,
      ownerEmail: targetUserEmail,
      source: targetUserEmail === viewerEmail ? "user_upload" : "admin_share",
    });

    return NextResponse.json({ file: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload file", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
