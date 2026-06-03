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

# ---------- RDS ----------

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "navara"
}

variable "database_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "navara_admin"
}

variable "database_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_deletion_protection" {
  description = "Whether RDS deletion protection is enabled"
  type        = bool
  default     = true
}

variable "rds_skip_final_snapshot" {
  description = "Skip RDS final snapshot on destroy"
  type        = bool
  default     = false
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

# ---------- File Portal ----------

variable "files_bucket_prefix" {
  description = "S3 key prefix used by the file portal for uploaded and shared files"
  type        = string
  default     = "portal-files"
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

variable "transfer_user_name" {
  description = "SFTP username in AWS Transfer Family"
  type        = string
  default     = "client-upload"
}

variable "transfer_user_public_key" {
  description = "SSH public key for the SFTP user"
  type        = string
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
