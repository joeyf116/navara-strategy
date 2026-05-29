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
  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sortedAnomalies = [...allAnomalies].sort((a, b) => {
    const severityDelta = severityRank[a.severity] - severityRank[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  });

  const activeCount = sortedAnomalies.filter((a) => a.status === "active").length;
  const criticalCount = sortedAnomalies.filter((a) => a.severity === "critical").length;
  const warningCount = sortedAnomalies.filter((a) => a.severity === "warning").length;

  return NextResponse.json({
    anomalies: sortedAnomalies,
    summary: {
      total: sortedAnomalies.length,
      active: activeCount,
      critical: criticalCount,
      warnings: warningCount,
      resolved: sortedAnomalies.filter((a) => a.status === "resolved").length,
    },
  });
}
