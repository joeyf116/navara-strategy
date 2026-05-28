import { NextResponse } from "next/server";
import { getIngestionJobs } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ jobs: getIngestionJobs() });
}
