import { NextResponse } from "next/server";
import { getFileEntries } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ files: getFileEntries() });
}
