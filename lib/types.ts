// Role types
export type UserRole =
  | "super_admin"
  | "admin"
  | "tenant_user"
  | "read_only_auditor";

// Dashboard metrics
export type DashboardMetrics = {
  totalFiles: number;
  filesProcessedToday: number;
  failedIngestions: number;
  queueDepth: number;
  avgIngestionTimeMs: number;
  activeTenants: number;
  auroraConnections: number;
  sftpConnectionsToday: number;
  storageUsedGB: number;
  processingThroughputPerMin: number;
  healthyWorkers: number;
  totalWorkers: number;
  dlqCount: number;
};

// Tenant
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive" | "suspended";
  filesUploaded: number;
  lastActivity: string;
  createdAt: string;
  contactEmail: string;
  plan: "starter" | "professional" | "enterprise";
};

// Ingestion Job
export type IngestionJob = {
  id: string;
  fileName: string;
  tenantId: string;
  tenantName: string;
  status: "queued" | "processing" | "completed" | "failed" | "retrying";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  fileSize: number;
};

// Service health
export type ServiceStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type ServiceHealth = {
  name: string;
  category: "aws" | "database" | "pipeline" | "application";
  status: ServiceStatus;
  latencyMs: number;
  lastChecked: string;
  details: string;
  metrics?: Record<string, number>;
};

// Queue metrics
export type QueueMetrics = {
  name: string;
  messagesVisible: number;
  messagesInFlight: number;
  messagesDelayed: number;
  oldestMessageAgeSeconds: number;
  throughputPerMinute: number;
  dlqCount: number;
};

// Audit log
export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  ipAddress: string;
  userAgent: string;
};

// Database metrics
export type DatabaseMetrics = {
  connectionPoolUsed: number;
  connectionPoolMax: number;
  activeQueries: number;
  slowQueries: number;
  avgQueryTimeMs: number;
  tableCount: number;
  totalSizeGB: number;
  replicationLagMs: number;
  acuCurrent: number;
  acuMin: number;
  acuMax: number;
  cpuPercent: number;
  memoryPercent: number;
  iopsRead: number;
  iopsWrite: number;
};

// File explorer entry
export type FileEntry = {
  id: string;
  name: string;
  tenantId: string;
  tenantName: string;
  size: number;
  status: "uploaded" | "processing" | "processed" | "failed";
  uploadedAt: string;
  processedAt: string | null;
  uploadMethod: "sftp" | "api" | "manual";
  recordCount: number | null;
  validationErrors: number;
};

// Time series data point
export type TimeSeriesPoint = {
  timestamp: string;
  value: number;
};

// Chart data for dashboard
export type ChartDataPoint = {
  name: string;
  value: number;
  [key: string]: string | number;
};

// Failed processing entry
export type FailedProcessing = {
  id: string;
  jobId: string;
  fileName: string;
  tenantName: string;
  failedAt: string;
  errorType: "validation" | "parsing" | "database" | "timeout" | "unknown";
  errorMessage: string;
  retryCount: number;
  canRetry: boolean;
  recordIndex: number | null;
};
