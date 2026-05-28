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

variable "app_image_identifier" {
  description = "ECR image URI with tag used by App Runner"
  type        = string
}

variable "transfer_user_name" {
  description = "SFTP username in AWS Transfer Family"
  type        = string
  default     = "client-upload"
}

variable "transfer_user_public_key" {
  description = "SSH public key for the SFTP user"
  type        = string
}
