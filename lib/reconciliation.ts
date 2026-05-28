// Automated reconciliation engine

export type ReconciliationStatus = "matched" | "mismatched" | "missing_source" | "missing_target" | "pending";

export type ReconciliationRecord = {
  id: string;
  sourceId: string | null;
  targetId: string | null;
  field: string;
  sourceValue: string;
  targetValue: string | null;
  status: ReconciliationStatus;
  discrepancy: string | null;
};

export type ReconciliationJob = {
  id: string;
  name: string;
  sourceSystem: string;
  targetSystem: string;
  tenantName: string;
  status: "completed" | "running" | "failed" | "scheduled";
  startedAt: string;
  completedAt: string | null;
  totalRecords: number;
  matchedRecords: number;
  mismatchedRecords: number;
  missingSourceRecords: number;
  missingTargetRecords: number;
  matchRate: number;
  records: ReconciliationRecord[];
};

export type ReconciliationSummary = {
  totalJobs: number;
  completedJobs: number;
  runningJobs: number;
  failedJobs: number;
  overallMatchRate: number;
  totalRecordsReconciled: number;
  totalDiscrepancies: number;
  recentJobs: ReconciliationJob[];
};

// Mock reconciliation jobs
export function getReconciliationJobs(): ReconciliationJob[] {
  const now = Date.now();
  return [
    {
      id: "recon-001",
      name: "Daily Transaction Reconciliation",
      sourceSystem: "Ingestion Pipeline",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "Acme Corporation",
      status: "completed",
      startedAt: new Date(now - 1800000).toISOString(),
      completedAt: new Date(now - 1740000).toISOString(),
      totalRecords: 12450,
      matchedRecords: 12438,
      mismatchedRecords: 8,
      missingSourceRecords: 2,
      missingTargetRecords: 2,
      matchRate: 99.9,
      records: [
        { id: "rec-001-1", sourceId: "TXN-2024-04521", targetId: "TXN-2024-04521", field: "amount", sourceValue: "1250.00", targetValue: "1250.50", status: "mismatched", discrepancy: "Amount differs by $0.50 - possible rounding issue" },
        { id: "rec-001-2", sourceId: "TXN-2024-04589", targetId: "TXN-2024-04589", field: "effective_date", sourceValue: "2024-12-15", targetValue: "2024-12-14", status: "mismatched", discrepancy: "Date differs by 1 day - timezone conversion issue" },
        { id: "rec-001-3", sourceId: "TXN-2024-04601", targetId: null, field: "transaction_id", sourceValue: "TXN-2024-04601", targetValue: null, status: "missing_target", discrepancy: "Record exists in source but not in target database" },
        { id: "rec-001-4", sourceId: "TXN-2024-04602", targetId: null, field: "transaction_id", sourceValue: "TXN-2024-04602", targetValue: null, status: "missing_target", discrepancy: "Record exists in source but not in target database" },
      ],
    },
    {
      id: "recon-002",
      name: "Payroll Data Verification",
      sourceSystem: "SFTP Upload",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "GlobalTech Industries",
      status: "completed",
      startedAt: new Date(now - 3600000).toISOString(),
      completedAt: new Date(now - 3540000).toISOString(),
      totalRecords: 8200,
      matchedRecords: 8197,
      mismatchedRecords: 3,
      missingSourceRecords: 0,
      missingTargetRecords: 0,
      matchRate: 99.96,
      records: [
        { id: "rec-002-1", sourceId: "PAY-2024-1045", targetId: "PAY-2024-1045", field: "net_amount", sourceValue: "3450.00", targetValue: "3449.99", status: "mismatched", discrepancy: "Penny difference due to floating point calculation" },
        { id: "rec-002-2", sourceId: "PAY-2024-1089", targetId: "PAY-2024-1089", field: "department", sourceValue: "Engineering", targetValue: "Eng", status: "mismatched", discrepancy: "Department name truncated in target system" },
        { id: "rec-002-3", sourceId: "PAY-2024-1102", targetId: "PAY-2024-1102", field: "employee_name", sourceValue: "O'Brien, James", targetValue: "O Brien, James", status: "mismatched", discrepancy: "Special character handling difference" },
      ],
    },
    {
      id: "recon-003",
      name: "Client Portfolio Sync",
      sourceSystem: "API Upload",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "Sterling Partners",
      status: "failed",
      startedAt: new Date(now - 7200000).toISOString(),
      completedAt: new Date(now - 7140000).toISOString(),
      totalRecords: 5420,
      matchedRecords: 4200,
      mismatchedRecords: 180,
      missingSourceRecords: 40,
      missingTargetRecords: 1000,
      matchRate: 77.5,
      records: [
        { id: "rec-003-1", sourceId: "CLT-3040", targetId: "CLT-3040", field: "account_id", sourceValue: "", targetValue: "ACC-99001", status: "mismatched", discrepancy: "Source record missing account_id - ingestion validation failure" },
        { id: "rec-003-2", sourceId: "CLT-3055", targetId: null, field: "client_id", sourceValue: "CLT-3055", targetValue: null, status: "missing_target", discrepancy: "Record failed ingestion due to schema validation error" },
        { id: "rec-003-3", sourceId: null, targetId: "CLT-2001", field: "client_id", sourceValue: "N/A", targetValue: "CLT-2001", status: "missing_source", discrepancy: "Record exists in target but was not in latest source file" },
      ],
    },
    {
      id: "recon-004",
      name: "Vendor Payment Matching",
      sourceSystem: "Ingestion Pipeline",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "Vanguard Analytics",
      status: "completed",
      startedAt: new Date(now - 14400000).toISOString(),
      completedAt: new Date(now - 14340000).toISOString(),
      totalRecords: 5600,
      matchedRecords: 5600,
      mismatchedRecords: 0,
      missingSourceRecords: 0,
      missingTargetRecords: 0,
      matchRate: 100,
      records: [],
    },
    {
      id: "recon-005",
      name: "Account Reconciliation",
      sourceSystem: "SFTP Upload",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "Meridian Financial",
      status: "running",
      startedAt: new Date(now - 120000).toISOString(),
      completedAt: null,
      totalRecords: 12800,
      matchedRecords: 8500,
      mismatchedRecords: 12,
      missingSourceRecords: 0,
      missingTargetRecords: 3,
      matchRate: 66.4,
      records: [
        { id: "rec-005-1", sourceId: "ACC-78001", targetId: "ACC-78001", field: "balance", sourceValue: "15420.00", targetValue: "15419.50", status: "mismatched", discrepancy: "Balance differs by $0.50" },
      ],
    },
    {
      id: "recon-006",
      name: "Customer Import Verification",
      sourceSystem: "Ingestion Pipeline",
      targetSystem: "Aurora PostgreSQL",
      tenantName: "Meridian Financial",
      status: "scheduled",
      startedAt: new Date(now + 3600000).toISOString(),
      completedAt: null,
      totalRecords: 0,
      matchedRecords: 0,
      mismatchedRecords: 0,
      missingSourceRecords: 0,
      missingTargetRecords: 0,
      matchRate: 0,
      records: [],
    },
  ];
}

// Get reconciliation summary
export function getReconciliationSummary(): ReconciliationSummary {
  const jobs = getReconciliationJobs();
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const runningJobs = jobs.filter((j) => j.status === "running");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  const totalRecords = completedJobs.reduce((sum, j) => sum + j.totalRecords, 0);
  const totalMatched = completedJobs.reduce((sum, j) => sum + j.matchedRecords, 0);
  const totalDiscrepancies = completedJobs.reduce(
    (sum, j) => sum + j.mismatchedRecords + j.missingSourceRecords + j.missingTargetRecords,
    0,
  );

  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    runningJobs: runningJobs.length,
    failedJobs: failedJobs.length,
    overallMatchRate: totalRecords > 0 ? Math.round((totalMatched / totalRecords) * 10000) / 100 : 0,
    totalRecordsReconciled: totalRecords,
    totalDiscrepancies,
    recentJobs: jobs,
  };
}
