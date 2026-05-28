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

# ---------- App Runner ----------

variable "app_image_identifier" {
  description = "ECR image URI with tag used by App Runner"
  type        = string
}

variable "apprunner_cpu" {
  description = "CPU units for the App Runner service (e.g. 256, 512, 1024, 2048, 4096)"
  type        = string
  default     = "256"
}

variable "apprunner_memory" {
  description = "Memory in MB for the App Runner service (e.g. 512, 1024, 2048, 3072, 4096)"
  type        = string
  default     = "512"
}

variable "apprunner_max_concurrency" {
  description = "Max concurrent requests per App Runner instance"
  type        = number
  default     = 100
}

variable "apprunner_max_size" {
  description = "Maximum number of App Runner instances"
  type        = number
  default     = 3
}

variable "apprunner_min_size" {
  description = "Minimum number of App Runner instances"
  type        = number
  default     = 1
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
