import type { DashboardMetrics, IngestionJob, QueueMetrics } from "@/lib/types";

// Anomaly severity levels
export type AnomalySeverity = "critical" | "warning" | "info";

// Anomaly detection result
export type Anomaly = {
  id: string;
  detectedAt: string;
  metric: string;
  category: "ingestion" | "queue" | "performance" | "resource" | "security";
  severity: AnomalySeverity;
  title: string;
  description: string;
  currentValue: number;
  expectedRange: { min: number; max: number };
  confidence: number; // 0-100
  status: "active" | "acknowledged" | "resolved";
  suggestedAction: string;
};

// Thresholds for anomaly detection (configurable baselines)
const THRESHOLDS = {
  failedIngestionRate: { warn: 0.05, critical: 0.15 },
  queueDepth: { warn: 50, critical: 200 },
  avgIngestionTimeMs: { warn: 5000, critical: 15000 },
  dlqCount: { warn: 5, critical: 20 },
  workerHealthRatio: { warn: 0.8, critical: 0.5 },
  connectionPoolUsage: { warn: 0.7, critical: 0.9 },
  cpuPercent: { warn: 70, critical: 90 },
  memoryPercent: { warn: 75, critical: 90 },
  throughputDropPercent: { warn: 30, critical: 60 },
};

// Simple statistical anomaly detection using z-score approach
function computeZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return Math.abs((value - mean) / stdDev);
}

// Detect anomalies in dashboard metrics
export function detectMetricAnomalies(metrics: DashboardMetrics): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  // Check failed ingestion rate
  const failRate = metrics.failedIngestions / Math.max(1, metrics.filesProcessedToday);
  if (failRate > THRESHOLDS.failedIngestionRate.critical) {
    anomalies.push({
      id: `anomaly-fail-rate-${Date.now()}`,
      detectedAt: now,
      metric: "failedIngestionRate",
      category: "ingestion",
      severity: "critical",
      title: "High Ingestion Failure Rate",
      description: `Failure rate is ${(failRate * 100).toFixed(1)}%, exceeding the critical threshold of ${THRESHOLDS.failedIngestionRate.critical * 100}%.`,
      currentValue: failRate * 100,
      expectedRange: { min: 0, max: THRESHOLDS.failedIngestionRate.warn * 100 },
      confidence: 95,
      status: "active",
      suggestedAction: "Review failed ingestion logs and check for schema changes or data quality issues.",
    });
  } else if (failRate > THRESHOLDS.failedIngestionRate.warn) {
    anomalies.push({
      id: `anomaly-fail-rate-${Date.now()}`,
      detectedAt: now,
      metric: "failedIngestionRate",
      category: "ingestion",
      severity: "warning",
      title: "Elevated Ingestion Failure Rate",
      description: `Failure rate is ${(failRate * 100).toFixed(1)}%, above the warning threshold of ${THRESHOLDS.failedIngestionRate.warn * 100}%.`,
      currentValue: failRate * 100,
      expectedRange: { min: 0, max: THRESHOLDS.failedIngestionRate.warn * 100 },
      confidence: 85,
      status: "active",
      suggestedAction: "Monitor failure trends and investigate recurring error patterns.",
    });
  }

  // Check queue depth
  if (metrics.queueDepth > THRESHOLDS.queueDepth.critical) {
    anomalies.push({
      id: `anomaly-queue-depth-${Date.now()}`,
      detectedAt: now,
      metric: "queueDepth",
      category: "queue",
      severity: "critical",
      title: "Queue Depth Critical",
      description: `Queue depth is ${metrics.queueDepth}, far exceeding normal operating range.`,
      currentValue: metrics.queueDepth,
      expectedRange: { min: 0, max: THRESHOLDS.queueDepth.warn },
      confidence: 98,
      status: "active",
      suggestedAction: "Scale up worker instances and investigate processing bottleneck.",
    });
  } else if (metrics.queueDepth > THRESHOLDS.queueDepth.warn) {
    anomalies.push({
      id: `anomaly-queue-depth-${Date.now()}`,
      detectedAt: now,
      metric: "queueDepth",
      category: "queue",
      severity: "warning",
      title: "Queue Depth Elevated",
      description: `Queue depth is ${metrics.queueDepth}, above the warning threshold of ${THRESHOLDS.queueDepth.warn}.`,
      currentValue: metrics.queueDepth,
      expectedRange: { min: 0, max: THRESHOLDS.queueDepth.warn },
      confidence: 80,
      status: "active",
      suggestedAction: "Monitor queue depth trend and prepare for scaling if needed.",
    });
  }

  // Check average ingestion time
  if (metrics.avgIngestionTimeMs > THRESHOLDS.avgIngestionTimeMs.critical) {
    anomalies.push({
      id: `anomaly-ingestion-time-${Date.now()}`,
      detectedAt: now,
      metric: "avgIngestionTimeMs",
      category: "performance",
      severity: "critical",
      title: "Ingestion Time Critical",
      description: `Average ingestion time is ${(metrics.avgIngestionTimeMs / 1000).toFixed(1)}s, exceeding critical threshold.`,
      currentValue: metrics.avgIngestionTimeMs,
      expectedRange: { min: 0, max: THRESHOLDS.avgIngestionTimeMs.warn },
      confidence: 92,
      status: "active",
      suggestedAction: "Investigate database performance, network latency, and worker resource allocation.",
    });
  } else if (metrics.avgIngestionTimeMs > THRESHOLDS.avgIngestionTimeMs.warn) {
    anomalies.push({
      id: `anomaly-ingestion-time-${Date.now()}`,
      detectedAt: now,
      metric: "avgIngestionTimeMs",
      category: "performance",
      severity: "warning",
      title: "Ingestion Time Elevated",
      description: `Average ingestion time is ${(metrics.avgIngestionTimeMs / 1000).toFixed(1)}s, above the warning threshold.`,
      currentValue: metrics.avgIngestionTimeMs,
      expectedRange: { min: 0, max: THRESHOLDS.avgIngestionTimeMs.warn },
      confidence: 78,
      status: "active",
      suggestedAction: "Review recent large file uploads and check for resource contention.",
    });
  }

  // Check DLQ count
  if (metrics.dlqCount > THRESHOLDS.dlqCount.critical) {
    anomalies.push({
      id: `anomaly-dlq-${Date.now()}`,
      detectedAt: now,
      metric: "dlqCount",
      category: "queue",
      severity: "critical",
      title: "Dead Letter Queue Overflow",
      description: `DLQ has ${metrics.dlqCount} messages, indicating persistent processing failures.`,
      currentValue: metrics.dlqCount,
      expectedRange: { min: 0, max: THRESHOLDS.dlqCount.warn },
      confidence: 97,
      status: "active",
      suggestedAction: "Review DLQ messages, fix root cause, and reprocess.",
    });
  } else if (metrics.dlqCount > 0) {
    anomalies.push({
      id: `anomaly-dlq-${Date.now()}`,
      detectedAt: now,
      metric: "dlqCount",
      category: "queue",
      severity: "info",
      title: "Messages in Dead Letter Queue",
      description: `${metrics.dlqCount} message(s) in DLQ requiring review.`,
      currentValue: metrics.dlqCount,
      expectedRange: { min: 0, max: 0 },
      confidence: 100,
      status: "active",
      suggestedAction: "Review DLQ messages and determine if they can be reprocessed.",
    });
  }

  // Check worker health
  const workerRatio = metrics.healthyWorkers / Math.max(1, metrics.totalWorkers);
  if (workerRatio < THRESHOLDS.workerHealthRatio.critical) {
    anomalies.push({
      id: `anomaly-workers-${Date.now()}`,
      detectedAt: now,
      metric: "workerHealth",
      category: "resource",
      severity: "critical",
      title: "Worker Fleet Degraded",
      description: `Only ${metrics.healthyWorkers}/${metrics.totalWorkers} workers are healthy (${(workerRatio * 100).toFixed(0)}%).`,
      currentValue: workerRatio * 100,
      expectedRange: { min: THRESHOLDS.workerHealthRatio.warn * 100, max: 100 },
      confidence: 96,
      status: "active",
      suggestedAction: "Investigate unhealthy workers, check logs and resource availability.",
    });
  } else if (workerRatio < THRESHOLDS.workerHealthRatio.warn) {
    anomalies.push({
      id: `anomaly-workers-${Date.now()}`,
      detectedAt: now,
      metric: "workerHealth",
      category: "resource",
      severity: "warning",
      title: "Worker Health Below Normal",
      description: `${metrics.healthyWorkers}/${metrics.totalWorkers} workers healthy. Some workers need attention.`,
      currentValue: workerRatio * 100,
      expectedRange: { min: THRESHOLDS.workerHealthRatio.warn * 100, max: 100 },
      confidence: 88,
      status: "active",
      suggestedAction: "Monitor worker health and investigate cold starts or resource limits.",
    });
  }

  return anomalies;
}

// Detect anomalies in ingestion job patterns
export function detectIngestionAnomalies(jobs: IngestionJob[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  // Check for retry storms
  const retryingJobs = jobs.filter((j) => j.retryCount > 2);
  if (retryingJobs.length > 0) {
    anomalies.push({
      id: `anomaly-retry-storm-${Date.now()}`,
      detectedAt: now,
      metric: "retryCount",
      category: "ingestion",
      severity: retryingJobs.length > 3 ? "critical" : "warning",
      title: "Excessive Retries Detected",
      description: `${retryingJobs.length} job(s) have exceeded 2 retries: ${retryingJobs.map((j) => j.fileName).join(", ")}.`,
      currentValue: retryingJobs.length,
      expectedRange: { min: 0, max: 1 },
      confidence: 90,
      status: "active",
      suggestedAction: "Review error messages for retrying jobs and check for systemic issues.",
    });
  }

  // Check for processing duration anomalies using z-score
  const completedJobs = jobs.filter((j) => j.durationMs !== null);
  if (completedJobs.length >= 3) {
    const durations = completedJobs.map((j) => j.durationMs as number);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const stdDev = Math.sqrt(durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length);

    for (const job of completedJobs) {
      const zScore = computeZScore(job.durationMs as number, mean, stdDev);
      if (zScore > 2.5) {
        anomalies.push({
          id: `anomaly-duration-${job.id}`,
          detectedAt: now,
          metric: "processingDuration",
          category: "performance",
          severity: zScore > 3 ? "critical" : "warning",
          title: `Unusual Processing Duration: ${job.fileName}`,
          description: `Job took ${((job.durationMs as number) / 1000).toFixed(1)}s (z-score: ${zScore.toFixed(1)}), significantly deviating from the mean of ${(mean / 1000).toFixed(1)}s.`,
          currentValue: job.durationMs as number,
          expectedRange: { min: Math.max(0, mean - 2 * stdDev), max: mean + 2 * stdDev },
          confidence: Math.min(99, 70 + zScore * 10),
          status: "active",
          suggestedAction: `Investigate processing of ${job.fileName} for potential data quality or resource issues.`,
        });
      }
    }
  }

  return anomalies;
}

// Detect anomalies in queue metrics
export function detectQueueAnomalies(queues: QueueMetrics[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const queue of queues) {
    // Check message age
    if (queue.oldestMessageAgeSeconds > 1800) {
      anomalies.push({
        id: `anomaly-msg-age-${queue.name}`,
        detectedAt: now,
        metric: "messageAge",
        category: "queue",
        severity: queue.oldestMessageAgeSeconds > 3600 ? "critical" : "warning",
        title: `Stale Messages in ${queue.name}`,
        description: `Oldest message is ${Math.round(queue.oldestMessageAgeSeconds / 60)} minutes old, indicating a processing backlog.`,
        currentValue: queue.oldestMessageAgeSeconds,
        expectedRange: { min: 0, max: 600 },
        confidence: 93,
        status: "active",
        suggestedAction: "Check consumers for the queue and verify processing pipeline is operational.",
      });
    }

    // Check for zero throughput with messages pending
    if (queue.throughputPerMinute === 0 && queue.messagesVisible > 0) {
      anomalies.push({
        id: `anomaly-zero-throughput-${queue.name}`,
        detectedAt: now,
        metric: "throughput",
        category: "queue",
        severity: "critical",
        title: `Zero Throughput: ${queue.name}`,
        description: `Queue has ${queue.messagesVisible} messages but throughput is 0/min. Processing may be stalled.`,
        currentValue: 0,
        expectedRange: { min: 1, max: 100 },
        confidence: 97,
        status: "active",
        suggestedAction: "Immediately verify consumer health and restart if necessary.",
      });
    }
  }

  return anomalies;
}

// Generate mock anomaly history for the dashboard
export function getAnomalyHistory(): Anomaly[] {
  const now = Date.now();
  return [
    {
      id: "anomaly-hist-001",
      detectedAt: new Date(now - 3600000).toISOString(),
      metric: "queueDepth",
      category: "queue",
      severity: "warning",
      title: "Queue Depth Spike Detected",
      description: "Queue depth reached 87 messages during peak hours, 74% above normal baseline of 50.",
      currentValue: 87,
      expectedRange: { min: 10, max: 50 },
      confidence: 89,
      status: "resolved",
      suggestedAction: "Auto-scaling resolved the queue backlog within 15 minutes.",
    },
    {
      id: "anomaly-hist-002",
      detectedAt: new Date(now - 7200000).toISOString(),
      metric: "failedIngestionRate",
      category: "ingestion",
      severity: "critical",
      title: "Sudden Increase in Failures",
      description: "Failure rate spiked to 18% from a baseline of 2%, correlated with schema change in tenant-3.",
      currentValue: 18,
      expectedRange: { min: 0, max: 5 },
      confidence: 94,
      status: "resolved",
      suggestedAction: "Schema validation rules updated to accommodate the new format.",
    },
    {
      id: "anomaly-hist-003",
      detectedAt: new Date(now - 1800000).toISOString(),
      metric: "processingDuration",
      category: "performance",
      severity: "warning",
      title: "Processing Slowdown Detected",
      description: "Average processing time increased 3.2x over the last hour, coinciding with a large batch upload.",
      currentValue: 7500,
      expectedRange: { min: 1000, max: 3000 },
      confidence: 82,
      status: "acknowledged",
      suggestedAction: "Large file processing throttling may be needed during batch uploads.",
    },
    {
      id: "anomaly-hist-004",
      detectedAt: new Date(now - 600000).toISOString(),
      metric: "dlqCount",
      category: "queue",
      severity: "info",
      title: "Messages in Dead Letter Queue",
      description: "3 messages moved to DLQ due to repeated processing failures.",
      currentValue: 3,
      expectedRange: { min: 0, max: 0 },
      confidence: 100,
      status: "active",
      suggestedAction: "Review DLQ messages and determine if they can be reprocessed.",
    },
    {
      id: "anomaly-hist-005",
      detectedAt: new Date(now - 300000).toISOString(),
      metric: "workerHealth",
      category: "resource",
      severity: "warning",
      title: "Worker Health Below Threshold",
      description: "1 of 6 workers reported unhealthy status due to cold start timeout.",
      currentValue: 83,
      expectedRange: { min: 90, max: 100 },
      confidence: 87,
      status: "active",
      suggestedAction: "Monitor worker recovery and consider provisioned concurrency.",
    },
    {
      id: "anomaly-hist-006",
      detectedAt: new Date(now - 14400000).toISOString(),
      metric: "connectionPoolUsage",
      category: "resource",
      severity: "warning",
      title: "Connection Pool Usage Elevated",
      description: "Database connection pool usage reached 78%, approaching the warning threshold.",
      currentValue: 78,
      expectedRange: { min: 20, max: 70 },
      confidence: 76,
      status: "resolved",
      suggestedAction: "Connection pool size was increased from 50 to 75.",
    },
  ];
}
