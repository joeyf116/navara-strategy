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

output "database_password" {
  value       = random_password.db.result
  description = "RDS password"
  sensitive   = true
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
