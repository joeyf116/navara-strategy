// Observability abstractions for future integration with
// Grafana, Prometheus, Datadog, New Relic, OpenTelemetry

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels?: string[];
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  correlationId?: string;
  traceId?: string;
  service: string;
  metadata?: Record<string, unknown>;
}

// Metric registry for tracking application metrics
const metrics = new Map<
  string,
  { definition: MetricDefinition; value: number }
>();

export function registerMetric(definition: MetricDefinition): void {
  metrics.set(definition.name, { definition, value: 0 });
}

export function incrementCounter(name: string, value = 1): void {
  const metric = metrics.get(name);
  if (metric && metric.definition.type === "counter") {
    metric.value += value;
  }
}

export function setGauge(name: string, value: number): void {
  const metric = metrics.get(name);
  if (metric && metric.definition.type === "gauge") {
    metric.value = value;
  }
}

export function getMetricValue(name: string): number | undefined {
  return metrics.get(name)?.value;
}

// Generate a correlation ID for request tracing
export function generateCorrelationId(): string {
  return `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Create structured log entry
export function createLogEntry(
  level: LogEntry["level"],
  message: string,
  service: string,
  metadata?: Record<string, unknown>,
  correlationId?: string,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    correlationId: correlationId ?? generateCorrelationId(),
    service,
    metadata,
  };
}

// Create trace context for distributed tracing
export function createTraceContext(
  serviceName: string,
  operationName: string,
  parentSpanId?: string,
): TraceContext {
  return {
    traceId: crypto.randomUUID(),
    spanId: crypto.randomUUID().slice(0, 16),
    parentSpanId,
    correlationId: generateCorrelationId(),
    serviceName,
    operationName,
    startTime: Date.now(),
    attributes: {},
  };
}

// Register default application metrics
registerMetric({
  name: "http_requests_total",
  type: "counter",
  description: "Total HTTP requests",
});
registerMetric({
  name: "http_request_duration_ms",
  type: "histogram",
  description: "HTTP request duration",
});
registerMetric({
  name: "active_connections",
  type: "gauge",
  description: "Active database connections",
});
registerMetric({
  name: "ingestion_jobs_processed",
  type: "counter",
  description: "Ingestion jobs processed",
});
registerMetric({
  name: "ingestion_jobs_failed",
  type: "counter",
  description: "Ingestion jobs failed",
});
registerMetric({
  name: "queue_depth",
  type: "gauge",
  description: "Current queue depth",
});
