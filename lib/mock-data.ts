import type {
  DashboardMetrics,
  Tenant,
  IngestionJob,
  ServiceHealth,
  QueueMetrics,
  AuditLogEntry,
  DatabaseMetrics,
  FileEntry,
  ChartDataPoint,
  FailedProcessing,
} from "@/lib/types";

export function getDashboardMetrics(): DashboardMetrics {
  return {
    totalFiles: 14_832,
    filesProcessedToday: 247,
    failedIngestions: 12,
    queueDepth: 34,
    avgIngestionTimeMs: 2_340,
    activeTenants: 23,
    auroraConnections: 18,
    sftpConnectionsToday: 156,
    storageUsedGB: 248.7,
    processingThroughputPerMin: 42,
    healthyWorkers: 5,
    totalWorkers: 6,
    dlqCount: 3,
  };
}

export function getTenants(): Tenant[] {
  return [
    { id: "tenant-1", name: "Acme Corporation", slug: "acme", status: "active", filesUploaded: 3421, lastActivity: new Date(Date.now() - 300000).toISOString(), createdAt: "2024-01-15T00:00:00Z", contactEmail: "ops@acme.com", plan: "enterprise" },
    { id: "tenant-2", name: "GlobalTech Industries", slug: "globaltech", status: "active", filesUploaded: 2156, lastActivity: new Date(Date.now() - 900000).toISOString(), createdAt: "2024-03-22T00:00:00Z", contactEmail: "admin@globaltech.io", plan: "professional" },
    { id: "tenant-3", name: "Sterling Partners", slug: "sterling", status: "active", filesUploaded: 1834, lastActivity: new Date(Date.now() - 1800000).toISOString(), createdAt: "2024-02-10T00:00:00Z", contactEmail: "data@sterling.com", plan: "enterprise" },
    { id: "tenant-4", name: "Meridian Financial", slug: "meridian", status: "active", filesUploaded: 1567, lastActivity: new Date(Date.now() - 3600000).toISOString(), createdAt: "2024-05-01T00:00:00Z", contactEmail: "tech@meridian.fin", plan: "professional" },
    { id: "tenant-5", name: "Nexus Data Corp", slug: "nexus", status: "inactive", filesUploaded: 892, lastActivity: new Date(Date.now() - 86400000).toISOString(), createdAt: "2024-06-18T00:00:00Z", contactEmail: "hello@nexusdata.co", plan: "starter" },
    { id: "tenant-6", name: "Pinnacle Systems", slug: "pinnacle", status: "suspended", filesUploaded: 234, lastActivity: new Date(Date.now() - 604800000).toISOString(), createdAt: "2024-08-05T00:00:00Z", contactEmail: "support@pinnacle.sys", plan: "starter" },
    { id: "tenant-7", name: "Vanguard Analytics", slug: "vanguard", status: "active", filesUploaded: 4521, lastActivity: new Date(Date.now() - 120000).toISOString(), createdAt: "2023-11-20T00:00:00Z", contactEmail: "ops@vanguard.ai", plan: "enterprise" },
    { id: "tenant-8", name: "Horizon Capital", slug: "horizon", status: "active", filesUploaded: 1243, lastActivity: new Date(Date.now() - 7200000).toISOString(), createdAt: "2024-04-12T00:00:00Z", contactEmail: "it@horizon.cap", plan: "professional" },
  ];
}

export function getIngestionJobs(): IngestionJob[] {
  const now = Date.now();
  return [
    { id: "job-001", fileName: "transactions_2024_q4.csv", tenantId: "tenant-1", tenantName: "Acme Corporation", status: "processing", startedAt: new Date(now - 45000).toISOString(), completedAt: null, durationMs: null, retryCount: 0, recordsProcessed: 12450, recordsFailed: 0, errorMessage: null, fileSize: 15_200_000 },
    { id: "job-002", fileName: "payroll_batch_dec.xlsx", tenantId: "tenant-2", tenantName: "GlobalTech Industries", status: "completed", startedAt: new Date(now - 180000).toISOString(), completedAt: new Date(now - 120000).toISOString(), durationMs: 60000, retryCount: 0, recordsProcessed: 8200, recordsFailed: 3, errorMessage: null, fileSize: 8_400_000 },
    { id: "job-003", fileName: "client_data_export.json", tenantId: "tenant-3", tenantName: "Sterling Partners", status: "failed", startedAt: new Date(now - 300000).toISOString(), completedAt: new Date(now - 290000).toISOString(), durationMs: 10000, retryCount: 3, recordsProcessed: 0, recordsFailed: 1, errorMessage: "Schema validation failed: missing required field 'account_id'", fileSize: 2_100_000 },
    { id: "job-004", fileName: "invoice_batch_001.csv", tenantId: "tenant-1", tenantName: "Acme Corporation", status: "queued", startedAt: null, completedAt: null, durationMs: null, retryCount: 0, recordsProcessed: 0, recordsFailed: 0, errorMessage: null, fileSize: 4_500_000 },
    { id: "job-005", fileName: "account_reconciliation.csv", tenantId: "tenant-4", tenantName: "Meridian Financial", status: "retrying", startedAt: new Date(now - 600000).toISOString(), completedAt: null, durationMs: null, retryCount: 2, recordsProcessed: 3400, recordsFailed: 15, errorMessage: "Timeout exceeded - retrying", fileSize: 12_800_000 },
    { id: "job-006", fileName: "vendor_payments.csv", tenantId: "tenant-7", tenantName: "Vanguard Analytics", status: "completed", startedAt: new Date(now - 900000).toISOString(), completedAt: new Date(now - 850000).toISOString(), durationMs: 50000, retryCount: 0, recordsProcessed: 5600, recordsFailed: 0, errorMessage: null, fileSize: 6_200_000 },
    { id: "job-007", fileName: "hr_records_update.xlsx", tenantId: "tenant-8", tenantName: "Horizon Capital", status: "processing", startedAt: new Date(now - 30000).toISOString(), completedAt: null, durationMs: null, retryCount: 0, recordsProcessed: 890, recordsFailed: 0, errorMessage: null, fileSize: 3_400_000 },
    { id: "job-008", fileName: "compliance_report.pdf", tenantId: "tenant-3", tenantName: "Sterling Partners", status: "completed", startedAt: new Date(now - 1800000).toISOString(), completedAt: new Date(now - 1750000).toISOString(), durationMs: 50000, retryCount: 1, recordsProcessed: 1200, recordsFailed: 2, errorMessage: null, fileSize: 1_900_000 },
  ];
}

export function getServiceHealth(): ServiceHealth[] {
  return [
    { name: "AWS Transfer Family", category: "aws", status: "healthy", latencyMs: 12, lastChecked: new Date().toISOString(), details: "All SFTP endpoints operational", metrics: { activeConnections: 8, transfersPerMin: 12 } },
    { name: "S3 Bucket (navara-ingestion)", category: "aws", status: "healthy", latencyMs: 8, lastChecked: new Date().toISOString(), details: "Bucket accessible, 248.7 GB used", metrics: { objectCount: 14832, sizeGB: 248.7 } },
    { name: "SQS Queue (ingestion-queue)", category: "aws", status: "healthy", latencyMs: 5, lastChecked: new Date().toISOString(), details: "34 messages in queue", metrics: { depth: 34, throughput: 42 } },
    { name: "SQS DLQ (ingestion-dlq)", category: "aws", status: "degraded", latencyMs: 5, lastChecked: new Date().toISOString(), details: "3 messages in DLQ - review required", metrics: { depth: 3 } },
    { name: "Lambda Workers", category: "aws", status: "healthy", latencyMs: 45, lastChecked: new Date().toISOString(), details: "5/6 workers healthy, 1 cold start", metrics: { healthy: 5, total: 6 } },
    { name: "Aurora PostgreSQL", category: "database", status: "healthy", latencyMs: 3, lastChecked: new Date().toISOString(), details: "Primary instance healthy, 2 ACUs", metrics: { connections: 18, acus: 2 } },
    { name: "CloudWatch", category: "aws", status: "healthy", latencyMs: 15, lastChecked: new Date().toISOString(), details: "All alarms in OK state", metrics: { alarmsOk: 12, alarmsTriggered: 0 } },
    { name: "File Validator", category: "pipeline", status: "healthy", latencyMs: 22, lastChecked: new Date().toISOString(), details: "Schema validation service operational" },
    { name: "Record Parser", category: "pipeline", status: "degraded", latencyMs: 150, lastChecked: new Date().toISOString(), details: "Higher than normal latency detected" },
    { name: "Data Writer", category: "pipeline", status: "healthy", latencyMs: 8, lastChecked: new Date().toISOString(), details: "Batch write service operational" },
    { name: "Next.js Portal", category: "application", status: "healthy", latencyMs: 2, lastChecked: new Date().toISOString(), details: "Application running normally" },
  ];
}

export function getQueueMetrics(): QueueMetrics[] {
  return [
    { name: "navara-ingestion-queue", messagesVisible: 34, messagesInFlight: 8, messagesDelayed: 2, oldestMessageAgeSeconds: 120, throughputPerMinute: 42, dlqCount: 0 },
    { name: "navara-validation-queue", messagesVisible: 12, messagesInFlight: 4, messagesDelayed: 0, oldestMessageAgeSeconds: 45, throughputPerMinute: 38, dlqCount: 0 },
    { name: "navara-processing-dlq", messagesVisible: 3, messagesInFlight: 0, messagesDelayed: 0, oldestMessageAgeSeconds: 3600, throughputPerMinute: 0, dlqCount: 3 },
    { name: "navara-notification-queue", messagesVisible: 5, messagesInFlight: 2, messagesDelayed: 1, oldestMessageAgeSeconds: 15, throughputPerMinute: 20, dlqCount: 0 },
  ];
}

export function getAuditLogs(): AuditLogEntry[] {
  const now = Date.now();
  return [
    { id: "log-001", timestamp: new Date(now - 60000).toISOString(), userId: "1", userName: "Super Admin", action: "REPROCESS_FILE", resource: "ingestion_job", resourceId: "job-003", details: "Triggered reprocessing of failed file client_data_export.json", ipAddress: "10.0.1.50", userAgent: "Mozilla/5.0" },
    { id: "log-002", timestamp: new Date(now - 300000).toISOString(), userId: "2", userName: "Admin User", action: "UPDATE_TENANT", resource: "tenant", resourceId: "tenant-6", details: "Changed tenant status from active to suspended", ipAddress: "10.0.1.51", userAgent: "Mozilla/5.0" },
    { id: "log-003", timestamp: new Date(now - 600000).toISOString(), userId: "3", userName: "Tenant User", action: "UPLOAD_FILE", resource: "file", resourceId: "file-042", details: "Uploaded transactions_2024_q4.csv via SFTP", ipAddress: "192.168.1.100", userAgent: "WinSCP/6.1" },
    { id: "log-004", timestamp: new Date(now - 1200000).toISOString(), userId: "1", userName: "Super Admin", action: "PURGE_DLQ", resource: "queue", resourceId: "navara-processing-dlq", details: "Purged 5 messages from dead letter queue", ipAddress: "10.0.1.50", userAgent: "Mozilla/5.0" },
    { id: "log-005", timestamp: new Date(now - 1800000).toISOString(), userId: "2", userName: "Admin User", action: "CREATE_TENANT", resource: "tenant", resourceId: "tenant-8", details: "Created new tenant Horizon Capital with professional plan", ipAddress: "10.0.1.51", userAgent: "Mozilla/5.0" },
    { id: "log-006", timestamp: new Date(now - 3600000).toISOString(), userId: "4", userName: "Auditor", action: "EXPORT_LOGS", resource: "audit_log", resourceId: "export-001", details: "Exported audit logs for date range 2024-01-01 to 2024-12-31", ipAddress: "10.0.1.52", userAgent: "Mozilla/5.0" },
    { id: "log-007", timestamp: new Date(now - 7200000).toISOString(), userId: "1", userName: "Super Admin", action: "UPDATE_CONFIG", resource: "settings", resourceId: "config-001", details: "Updated max file size limit from 25MB to 50MB", ipAddress: "10.0.1.50", userAgent: "Mozilla/5.0" },
    { id: "log-008", timestamp: new Date(now - 14400000).toISOString(), userId: "3", userName: "Tenant User", action: "VIEW_FILES", resource: "file_explorer", resourceId: "tenant-1", details: "Viewed file listing for Acme Corporation", ipAddress: "192.168.1.100", userAgent: "Mozilla/5.0" },
  ];
}

export function getDatabaseMetrics(): DatabaseMetrics {
  return {
    connectionPoolUsed: 18,
    connectionPoolMax: 50,
    activeQueries: 4,
    slowQueries: 1,
    avgQueryTimeMs: 12.4,
    tableCount: 24,
    totalSizeGB: 12.8,
    replicationLagMs: 2,
    acuCurrent: 2,
    acuMin: 0.5,
    acuMax: 8,
    cpuPercent: 34.2,
    memoryPercent: 62.1,
    iopsRead: 1240,
    iopsWrite: 856,
  };
}

export function getFileEntries(): FileEntry[] {
  const now = Date.now();
  return [
    { id: "file-001", name: "transactions_2024_q4.csv", tenantId: "tenant-1", tenantName: "Acme Corporation", size: 15_200_000, status: "processing", uploadedAt: new Date(now - 300000).toISOString(), processedAt: null, uploadMethod: "sftp", recordCount: null, validationErrors: 0 },
    { id: "file-002", name: "payroll_batch_dec.xlsx", tenantId: "tenant-2", tenantName: "GlobalTech Industries", size: 8_400_000, status: "processed", uploadedAt: new Date(now - 3600000).toISOString(), processedAt: new Date(now - 3540000).toISOString(), uploadMethod: "sftp", recordCount: 8200, validationErrors: 3 },
    { id: "file-003", name: "client_data_export.json", tenantId: "tenant-3", tenantName: "Sterling Partners", size: 2_100_000, status: "failed", uploadedAt: new Date(now - 7200000).toISOString(), processedAt: null, uploadMethod: "api", recordCount: null, validationErrors: 1 },
    { id: "file-004", name: "invoice_batch_001.csv", tenantId: "tenant-1", tenantName: "Acme Corporation", size: 4_500_000, status: "uploaded", uploadedAt: new Date(now - 120000).toISOString(), processedAt: null, uploadMethod: "sftp", recordCount: null, validationErrors: 0 },
    { id: "file-005", name: "account_reconciliation.csv", tenantId: "tenant-4", tenantName: "Meridian Financial", size: 12_800_000, status: "processing", uploadedAt: new Date(now - 1800000).toISOString(), processedAt: null, uploadMethod: "sftp", recordCount: null, validationErrors: 0 },
    { id: "file-006", name: "vendor_payments.csv", tenantId: "tenant-7", tenantName: "Vanguard Analytics", size: 6_200_000, status: "processed", uploadedAt: new Date(now - 14400000).toISOString(), processedAt: new Date(now - 14350000).toISOString(), uploadMethod: "sftp", recordCount: 5600, validationErrors: 0 },
    { id: "file-007", name: "hr_records_update.xlsx", tenantId: "tenant-8", tenantName: "Horizon Capital", size: 3_400_000, status: "processing", uploadedAt: new Date(now - 600000).toISOString(), processedAt: null, uploadMethod: "manual", recordCount: null, validationErrors: 0 },
    { id: "file-008", name: "compliance_report.pdf", tenantId: "tenant-3", tenantName: "Sterling Partners", size: 1_900_000, status: "processed", uploadedAt: new Date(now - 86400000).toISOString(), processedAt: new Date(now - 86350000).toISOString(), uploadMethod: "sftp", recordCount: 1200, validationErrors: 2 },
    { id: "file-009", name: "quarterly_summary.csv", tenantId: "tenant-7", tenantName: "Vanguard Analytics", size: 920_000, status: "processed", uploadedAt: new Date(now - 172800000).toISOString(), processedAt: new Date(now - 172750000).toISOString(), uploadMethod: "api", recordCount: 450, validationErrors: 0 },
    { id: "file-010", name: "customer_import.csv", tenantId: "tenant-4", tenantName: "Meridian Financial", size: 5_600_000, status: "processed", uploadedAt: new Date(now - 259200000).toISOString(), processedAt: new Date(now - 259150000).toISOString(), uploadMethod: "sftp", recordCount: 3200, validationErrors: 1 },
  ];
}

export function getFailedProcessing(): FailedProcessing[] {
  const now = Date.now();
  return [
    { id: "fail-001", jobId: "job-003", fileName: "client_data_export.json", tenantName: "Sterling Partners", failedAt: new Date(now - 290000).toISOString(), errorType: "validation", errorMessage: "Schema validation failed: missing required field 'account_id' at row 1", retryCount: 3, canRetry: false, recordIndex: 1 },
    { id: "fail-002", jobId: "job-005", fileName: "account_reconciliation.csv", tenantName: "Meridian Financial", failedAt: new Date(now - 600000).toISOString(), errorType: "timeout", errorMessage: "Processing timeout exceeded 120s limit", retryCount: 2, canRetry: true, recordIndex: null },
    { id: "fail-003", jobId: "job-012", fileName: "legacy_import.dat", tenantName: "Nexus Data Corp", failedAt: new Date(now - 3600000).toISOString(), errorType: "parsing", errorMessage: "Unsupported file format: binary data detected at offset 0x0000", retryCount: 1, canRetry: false, recordIndex: null },
    { id: "fail-004", jobId: "job-015", fileName: "batch_update_v2.csv", tenantName: "Acme Corporation", failedAt: new Date(now - 7200000).toISOString(), errorType: "database", errorMessage: "Unique constraint violation on column 'transaction_id'", retryCount: 0, canRetry: true, recordIndex: 42 },
    { id: "fail-005", jobId: "job-018", fileName: "partner_feed.xml", tenantName: "GlobalTech Industries", failedAt: new Date(now - 14400000).toISOString(), errorType: "validation", errorMessage: "Invalid date format in field 'effective_date': expected ISO 8601", retryCount: 1, canRetry: true, recordIndex: 156 },
  ];
}

export function getIngestionChartData(): ChartDataPoint[] {
  return [
    { name: "00:00", value: 0, ingested: 12, failed: 1 },
    { name: "02:00", value: 0, ingested: 8, failed: 0 },
    { name: "04:00", value: 0, ingested: 5, failed: 0 },
    { name: "06:00", value: 0, ingested: 15, failed: 2 },
    { name: "08:00", value: 0, ingested: 45, failed: 3 },
    { name: "10:00", value: 0, ingested: 62, failed: 1 },
    { name: "12:00", value: 0, ingested: 48, failed: 2 },
    { name: "14:00", value: 0, ingested: 55, failed: 0 },
    { name: "16:00", value: 0, ingested: 38, failed: 1 },
    { name: "18:00", value: 0, ingested: 28, failed: 0 },
    { name: "20:00", value: 0, ingested: 18, failed: 1 },
    { name: "22:00", value: 0, ingested: 10, failed: 0 },
  ];
}

export function getThroughputChartData(): ChartDataPoint[] {
  return [
    { name: "Mon", value: 0, throughput: 342 },
    { name: "Tue", value: 0, throughput: 456 },
    { name: "Wed", value: 0, throughput: 389 },
    { name: "Thu", value: 0, throughput: 521 },
    { name: "Fri", value: 0, throughput: 478 },
    { name: "Sat", value: 0, throughput: 189 },
    { name: "Sun", value: 0, throughput: 134 },
  ];
}
