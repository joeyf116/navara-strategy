import { NextResponse } from "next/server";
import { getQueueMetrics } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ queues: getQueueMetrics() });
}
