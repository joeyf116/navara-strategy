import { NextResponse } from "next/server";
import { getDashboardMetrics, getIngestionChartData, getThroughputChartData } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    metrics: getDashboardMetrics(),
    ingestionChart: getIngestionChartData(),
    throughputChart: getThroughputChartData(),
  });
}
