// Application user roles, mapped from Cognito groups (see lib/auth.ts).
export type UserRole =
  | "super_admin"
  | "admin"
  | "tenant_user"
  | "read_only_auditor";
