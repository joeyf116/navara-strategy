// Intelligent ingestion validation rules engine

export type ValidationRuleType =
  | "schema"
  | "format"
  | "range"
  | "required"
  | "uniqueness"
  | "referential"
  | "custom";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationRule = {
  id: string;
  name: string;
  type: ValidationRuleType;
  description: string;
  field: string;
  severity: ValidationSeverity;
  enabled: boolean;
  pattern?: string;
  minValue?: number;
  maxValue?: number;
  allowedValues?: string[];
};

export type ValidationResult = {
  id: string;
  fileId: string;
  fileName: string;
  tenantName: string;
  validatedAt: string;
  status: "passed" | "failed" | "warnings";
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  warningRecords: number;
  errors: ValidationError[];
  duration: number;
  rulesApplied: number;
};

export type ValidationError = {
  ruleId: string;
  ruleName: string;
  severity: ValidationSeverity;
  field: string;
  row: number | null;
  value: string;
  expected: string;
  message: string;
};

export type ValidationSummary = {
  totalValidations: number;
  passed: number;
  failed: number;
  withWarnings: number;
  passRate: number;
  totalErrors: number;
  avgValidationTimeMs: number;
  commonErrors: { rule: string; count: number }[];
  recentResults: ValidationResult[];
};

// Default validation rules
export function getDefaultValidationRules(): ValidationRule[] {
  return [
    {
      id: "rule-001",
      name: "Required Account ID",
      type: "required",
      description: "Every record must have a non-empty account_id field",
      field: "account_id",
      severity: "error",
      enabled: true,
    },
    {
      id: "rule-002",
      name: "Valid Date Format",
      type: "format",
      description: "Date fields must follow ISO 8601 format (YYYY-MM-DD)",
      field: "effective_date",
      severity: "error",
      enabled: true,
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    {
      id: "rule-003",
      name: "Amount Range Check",
      type: "range",
      description: "Transaction amounts must be between -1,000,000 and 1,000,000",
      field: "amount",
      severity: "error",
      enabled: true,
      minValue: -1000000,
      maxValue: 1000000,
    },
    {
      id: "rule-004",
      name: "Valid Email Format",
      type: "format",
      description: "Email addresses must be in valid format",
      field: "email",
      severity: "warning",
      enabled: true,
      pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    },
    {
      id: "rule-005",
      name: "Unique Transaction ID",
      type: "uniqueness",
      description: "Transaction IDs must be unique within each file",
      field: "transaction_id",
      severity: "error",
      enabled: true,
    },
    {
      id: "rule-006",
      name: "Valid Currency Code",
      type: "schema",
      description: "Currency must be a valid ISO 4217 code",
      field: "currency",
      severity: "error",
      enabled: true,
      allowedValues: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"],
    },
    {
      id: "rule-007",
      name: "Valid Status Value",
      type: "schema",
      description: "Status field must contain a known status value",
      field: "status",
      severity: "warning",
      enabled: true,
      allowedValues: ["active", "inactive", "pending", "closed", "suspended"],
    },
    {
      id: "rule-008",
      name: "Required Tenant Reference",
      type: "referential",
      description: "Each record must reference a valid tenant in the system",
      field: "tenant_id",
      severity: "error",
      enabled: true,
    },
    {
      id: "rule-009",
      name: "Phone Number Format",
      type: "format",
      description: "Phone numbers must match E.164 format",
      field: "phone",
      severity: "info",
      enabled: false,
      pattern: "^\\+[1-9]\\d{1,14}$",
    },
    {
      id: "rule-010",
      name: "Non-Negative Count",
      type: "range",
      description: "Count fields must be zero or positive",
      field: "record_count",
      severity: "error",
      enabled: true,
      minValue: 0,
    },
  ];
}

// Mock validation results
export function getValidationResults(): ValidationResult[] {
  const now = Date.now();
  return [
    {
      id: "val-001",
      fileId: "file-001",
      fileName: "transactions_2024_q4.csv",
      tenantName: "Acme Corporation",
      validatedAt: new Date(now - 300000).toISOString(),
      status: "passed",
      totalRecords: 12450,
      validRecords: 12450,
      invalidRecords: 0,
      warningRecords: 3,
      errors: [
        { ruleId: "rule-004", ruleName: "Valid Email Format", severity: "warning", field: "email", row: 1024, value: "john.doe@", expected: "valid email format", message: "Invalid email format at row 1024" },
        { ruleId: "rule-004", ruleName: "Valid Email Format", severity: "warning", field: "email", row: 5678, value: "missing-at-sign", expected: "valid email format", message: "Invalid email format at row 5678" },
        { ruleId: "rule-007", ruleName: "Valid Status Value", severity: "warning", field: "status", row: 9102, value: "archived", expected: "active|inactive|pending|closed|suspended", message: "Unknown status value 'archived' at row 9102" },
      ],
      duration: 4200,
      rulesApplied: 8,
    },
    {
      id: "val-002",
      fileId: "file-002",
      fileName: "payroll_batch_dec.xlsx",
      tenantName: "GlobalTech Industries",
      validatedAt: new Date(now - 3600000).toISOString(),
      status: "warnings",
      totalRecords: 8200,
      validRecords: 8197,
      invalidRecords: 0,
      warningRecords: 3,
      errors: [
        { ruleId: "rule-003", ruleName: "Amount Range Check", severity: "warning", field: "amount", row: 45, value: "-500000.50", expected: "-1000000 to 1000000", message: "Large negative amount detected at row 45 - review recommended" },
        { ruleId: "rule-004", ruleName: "Valid Email Format", severity: "warning", field: "email", row: 2100, value: "", expected: "valid email format", message: "Empty email field at row 2100" },
        { ruleId: "rule-007", ruleName: "Valid Status Value", severity: "warning", field: "status", row: 8100, value: "on_hold", expected: "active|inactive|pending|closed|suspended", message: "Unknown status value 'on_hold' at row 8100" },
      ],
      duration: 3100,
      rulesApplied: 8,
    },
    {
      id: "val-003",
      fileId: "file-003",
      fileName: "client_data_export.json",
      tenantName: "Sterling Partners",
      validatedAt: new Date(now - 7200000).toISOString(),
      status: "failed",
      totalRecords: 5420,
      validRecords: 5380,
      invalidRecords: 40,
      warningRecords: 12,
      errors: [
        { ruleId: "rule-001", ruleName: "Required Account ID", severity: "error", field: "account_id", row: 1, value: "", expected: "non-empty value", message: "Missing required field 'account_id' at row 1" },
        { ruleId: "rule-001", ruleName: "Required Account ID", severity: "error", field: "account_id", row: 15, value: "", expected: "non-empty value", message: "Missing required field 'account_id' at rows 15-54" },
        { ruleId: "rule-002", ruleName: "Valid Date Format", severity: "error", field: "effective_date", row: 156, value: "12/31/2024", expected: "YYYY-MM-DD", message: "Invalid date format '12/31/2024' at row 156 - expected ISO 8601" },
        { ruleId: "rule-005", ruleName: "Unique Transaction ID", severity: "error", field: "transaction_id", row: 3400, value: "TXN-2024-00891", expected: "unique value", message: "Duplicate transaction ID 'TXN-2024-00891' found at rows 3400 and 3401" },
        { ruleId: "rule-006", ruleName: "Valid Currency Code", severity: "error", field: "currency", row: 4200, value: "EURO", expected: "USD|EUR|GBP|JPY|CAD|AUD|CHF", message: "Invalid currency code 'EURO' at row 4200" },
      ],
      duration: 2800,
      rulesApplied: 8,
    },
    {
      id: "val-004",
      fileId: "file-006",
      fileName: "vendor_payments.csv",
      tenantName: "Vanguard Analytics",
      validatedAt: new Date(now - 14400000).toISOString(),
      status: "passed",
      totalRecords: 5600,
      validRecords: 5600,
      invalidRecords: 0,
      warningRecords: 0,
      errors: [],
      duration: 1900,
      rulesApplied: 8,
    },
    {
      id: "val-005",
      fileId: "file-010",
      fileName: "customer_import.csv",
      tenantName: "Meridian Financial",
      validatedAt: new Date(now - 259200000).toISOString(),
      status: "warnings",
      totalRecords: 3200,
      validRecords: 3199,
      invalidRecords: 0,
      warningRecords: 1,
      errors: [
        { ruleId: "rule-004", ruleName: "Valid Email Format", severity: "warning", field: "email", row: 2890, value: "user@@domain.com", expected: "valid email format", message: "Invalid email format at row 2890" },
      ],
      duration: 1200,
      rulesApplied: 8,
    },
    {
      id: "val-006",
      fileId: "file-008",
      fileName: "compliance_report.pdf",
      tenantName: "Sterling Partners",
      validatedAt: new Date(now - 86400000).toISOString(),
      status: "passed",
      totalRecords: 1200,
      validRecords: 1198,
      invalidRecords: 0,
      warningRecords: 2,
      errors: [
        { ruleId: "rule-007", ruleName: "Valid Status Value", severity: "warning", field: "status", row: 890, value: "review", expected: "active|inactive|pending|closed|suspended", message: "Unknown status 'review' at row 890" },
        { ruleId: "rule-007", ruleName: "Valid Status Value", severity: "warning", field: "status", row: 1150, value: "draft", expected: "active|inactive|pending|closed|suspended", message: "Unknown status 'draft' at row 1150" },
      ],
      duration: 800,
      rulesApplied: 8,
    },
  ];
}

// Get validation summary
export function getValidationSummary(): ValidationSummary {
  const results = getValidationResults();
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const withWarnings = results.filter((r) => r.status === "warnings").length;
  const avgTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const passRate = results.length > 0 ? Math.round((passed / results.length) * 1000) / 10 : 0;

  // Count common errors across all results
  const errorCounts: Record<string, number> = {};
  for (const result of results) {
    for (const error of result.errors) {
      errorCounts[error.ruleName] = (errorCounts[error.ruleName] || 0) + 1;
    }
  }

  const commonErrors = Object.entries(errorCounts)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalValidations: results.length,
    passed,
    failed,
    withWarnings,
    passRate,
    totalErrors,
    avgValidationTimeMs: Math.round(avgTime),
    commonErrors,
    recentResults: results,
  };
}
