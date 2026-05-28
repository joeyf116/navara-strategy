import { NextResponse } from "next/server";
import { getServiceHealth } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ services: getServiceHealth() });
}
