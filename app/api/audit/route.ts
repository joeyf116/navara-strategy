import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ logs: getAuditLogs() });
}
