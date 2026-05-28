import { NextResponse } from "next/server";
import { getFailedProcessing } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ failures: getFailedProcessing() });
}
