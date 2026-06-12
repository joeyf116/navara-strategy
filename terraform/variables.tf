variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for named resources"
  type        = string
  default     = "navara-sftp"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, production)"
  type        = string
  default     = "production"
}

# ---------- S3 ----------

variable "s3_force_destroy" {
  description = "Allow Terraform to delete non-empty S3 bucket"
  type        = bool
  default     = false
}

# ---------- ECR ----------

variable "ecr_force_delete" {
  description = "Allow Terraform to delete ECR repository even if it contains images"
  type        = bool
  default     = false
}

variable "ecr_max_image_count" {
  description = "Maximum number of images to retain in the ECR repository"
  type        = number
  default     = 30
}

# ---------- GitHub Actions OIDC ----------

variable "github_repository" {
  description = "GitHub owner/repo allowed to assume the deploy role via OIDC"
  type        = string
  default     = "joeyf116/navara-strategy"
}

variable "github_branch" {
  description = "Git branch allowed to assume the deploy role via OIDC"
  type        = string
  default     = "main"
}

variable "github_actions_deploy_role_name" {
  description = "IAM role name for GitHub Actions deployments"
  type        = string
  default     = "navara-sftp-github-actions-deploy"
}

variable "tf_state_bucket" {
  description = <<-EOT
    Name of the S3 bucket holding Terraform state. Used only to scope the
    deploy role's S3 permissions — the backend itself is configured via
    -backend-config. Leave empty to omit state-bucket access from the deploy
    role (deploys from CI will then fail at terraform init).
  EOT
  type        = string
  default     = ""
}

variable "tf_lock_table" {
  description = "Name of the DynamoDB table used for Terraform state locking; empty allows any table name"
  type        = string
  default     = ""
}

# ---------- File Portal ----------

variable "files_bucket_prefix" {
  description = "S3 key prefix used by the web and WebDAV file portal; user content is stored under uploads/{user_email}/"
  type        = string
  default     = "uploads"
}

variable "web_cors_allowed_origins" {
  description = "Origins allowed to call S3 directly for file uploads/downloads"
  type        = list(string)
  default     = ["*"]
}

# ---------- Web App (Lambda) ----------

variable "app_image_identifier" {
  description = "ECR image URI with tag used by the Lambda web function"
  type        = string
}

variable "lambda_memory_size" {
  description = "Memory size (MB) for the Lambda web function"
  type        = number
  default     = 1024
}

variable "lambda_timeout" {
  description = "Timeout (seconds) for the Lambda web function"
  type        = number
  default     = 30
}

variable "lambda_architecture" {
  description = "Lambda architecture for the web function (x86_64 or arm64)"
  type        = string
  default     = "x86_64"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "app_public_url" {
  description = "Public HTTPS base URL used by Auth.js for callback and redirect URLs"
  type        = string
}

variable "webdav_url" {
  description = <<-EOT
    Explicit WebDAV base URL shown to users for network-drive mapping.
    When left empty the Lambda Function URL (/api/dav) is used, which
    supports all HTTP methods and bypasses CloudFront's method restrictions.
    Override this once you attach a custom domain to the CloudFront
    distribution (after the Lambda@Edge behavior is deployed).
  EOT
  type        = string
  default     = ""
}

# ---------- Observability ----------

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# ---------- Cognito ----------

variable "cognito_domain" {
  description = "Unique Cognito hosted UI domain prefix"
  type        = string
}

variable "cognito_callback_urls" {
  description = "Allowed OAuth callback URLs for the Cognito app client"
  type        = list(string)
}

variable "cognito_logout_urls" {
  description = "Allowed logout redirect URLs for the Cognito app client"
  type        = list(string)
}

# ---------- PostgreSQL (RDS) ----------

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "excel_db"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "db_admin"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_backup_retention_period" {
  description = <<-EOT
    RDS automated backup retention period in days. Default 7 for production
    safety (small backup-storage cost). NOTE: changing 0 -> nonzero on an
    existing single-AZ instance triggers a brief outage, applied during the
    next maintenance window. Set to 0 only for disposable environments.
  EOT
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Protect the RDS instance from deletion; set false only when intentionally decommissioning"
  type        = bool
  default     = true
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot when the RDS instance is destroyed; keep false in production"
  type        = bool
  default     = false
}

variable "db_public_cidr_blocks" {
  description = <<-EOT
    CIDR blocks allowed to reach PostgreSQL on 5432 for external ODBC tools.
    Defaults to the open internet to preserve existing behavior — restrict to
    office/VPN egress IPs (e.g. ["203.0.113.10/32"]) as soon as they are known.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ---------- Tagging / cost allocation ----------

variable "owner" {
  description = "Owner tag applied to all resources (team or email) for cost allocation"
  type        = string
  default     = ""
}

variable "cost_center" {
  description = "CostCenter tag applied to all resources; leave empty to omit"
  type        = string
  default     = ""
}

# ---------- Networking (cost) ----------

variable "enable_lambda_vpc" {
  description = <<-EOT
    Attach the web and Excel-parser Lambdas to private VPC subnets behind a NAT Gateway.
    Disabled by default: RDS is publicly accessible, so VPC attachment adds no security
    boundary while the NAT Gateway costs ~$33/month + data processing. Set to true to
    restore the previous private-subnet + NAT architecture.
  EOT
  type        = bool
  default     = false
}

# ---------- S3 lifecycle (cost) ----------

variable "s3_noncurrent_version_expiration_days" {
  description = "Days to retain noncurrent (overwritten/deleted) S3 object versions before permanent expiry"
  type        = number
  default     = 30
}

# ---------- AWS Budgets ----------

variable "monthly_budget_limit" {
  description = "Monthly account-level cost budget limit"
  type        = number
  default     = 300
}

variable "budget_currency" {
  description = "Currency for AWS Budgets (e.g. USD)"
  type        = string
  default     = "USD"
}

variable "budget_alert_emails" {
  description = "Email addresses subscribed to budget alerts; alerts are skipped when empty"
  type        = list(string)
  default     = []
}

variable "enable_budget_alerts" {
  description = "Enable budget alert notifications (budgets themselves are always created)"
  type        = bool
  default     = true
}

variable "environment_budget_limit" {
  description = "Optional monthly budget for this environment, filtered by the Environment cost-allocation tag; null disables the environment budget"
  type        = number
  default     = null
}
