output "app_url" {
  value       = aws_apprunner_service.this.service_url
  description = "Public URL for the Next.js file hub"
}

output "database_endpoint" {
  value       = aws_db_instance.this.address
  description = "RDS hostname"
}

output "database_port" {
  value       = aws_db_instance.this.port
  description = "RDS port"
}

output "database_name" {
  value       = var.database_name
  description = "RDS database name"
}

output "database_username" {
  value       = var.database_username
  description = "RDS username"
}

output "database_url_secret_arn" {
  value       = aws_secretsmanager_secret.database_url.arn
  description = "Secrets Manager ARN containing DATABASE_URL for App Runner"
}

output "nextauth_secret_arn" {
  value       = aws_secretsmanager_secret.nextauth_secret.arn
  description = "Secrets Manager ARN containing NEXTAUTH_SECRET"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL for pushing container images"
}

output "sftp_endpoint" {
  value       = aws_transfer_server.this.endpoint
  description = "AWS Transfer Family endpoint"
}

output "sftp_username" {
  value       = aws_transfer_user.client.user_name
  description = "Provisioned SFTP username"
}

output "sftp_bucket" {
  value       = aws_s3_bucket.transfer.bucket
  description = "S3 bucket backing SFTP uploads"
}

output "cloudwatch_log_group" {
  value       = aws_cloudwatch_log_group.app.name
  description = "CloudWatch log group for App Runner"
}

output "apprunner_service_arn" {
  value       = aws_apprunner_service.this.arn
  description = "App Runner service ARN"
}
