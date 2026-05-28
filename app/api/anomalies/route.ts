import { NextResponse } from "next/server";
import { getDashboardMetrics, getIngestionJobs, getQueueMetrics } from "@/lib/mock-data";
import {
  detectMetricAnomalies,
  detectIngestionAnomalies,
  detectQueueAnomalies,
  getAnomalyHistory,
} from "@/lib/anomaly-detection";

export async function GET() {
  const metrics = getDashboardMetrics();
  const jobs = getIngestionJobs();
  const queues = getQueueMetrics();

  const metricAnomalies = detectMetricAnomalies(metrics);
  const ingestionAnomalies = detectIngestionAnomalies(jobs);
  const queueAnomalies = detectQueueAnomalies(queues);
  const history = getAnomalyHistory();

  const allAnomalies = [...metricAnomalies, ...ingestionAnomalies, ...queueAnomalies, ...history];

  const activeCount = allAnomalies.filter((a) => a.status === "active").length;
  const criticalCount = allAnomalies.filter((a) => a.severity === "critical").length;
  const warningCount = allAnomalies.filter((a) => a.severity === "warning").length;

  return NextResponse.json({
    anomalies: allAnomalies,
    summary: {
      total: allAnomalies.length,
      active: activeCount,
      critical: criticalCount,
      warnings: warningCount,
      resolved: allAnomalies.filter((a) => a.status === "resolved").length,
    },
  });
}
