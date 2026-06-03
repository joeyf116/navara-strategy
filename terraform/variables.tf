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

# ---------- Transfer Family ----------

variable "transfer_users" {
  description = "Map of SFTP username to SSH public key. Each user is isolated to /{bucket}/clients/{username}/. Add a client by adding an entry here and running terraform apply."
  type        = map(string)
  default     = {}
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
