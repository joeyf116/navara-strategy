import { NextResponse } from "next/server";
import { getDatabaseMetrics } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ metrics: getDatabaseMetrics() });
}
