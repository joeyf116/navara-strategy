import { NextResponse } from "next/server";
import { getTenants } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ tenants: getTenants() });
}
