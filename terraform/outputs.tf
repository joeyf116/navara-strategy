output "app_url" {
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
  description = "Public CloudFront URL for the Next.js web app"
}

output "webdav_endpoint" {
  value       = "https://${aws_cloudfront_distribution.web.domain_name}/api/dav"
  description = "WebDAV endpoint for mapping network drives"
}

output "lambda_url" {
  value       = aws_lambda_function_url.web.function_url
  description = "Lambda Function URL origin"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.web.domain_name
  description = "CloudFront distribution domain"
}

output "nextauth_secret_arn" {
  value       = aws_secretsmanager_secret.nextauth_secret.arn
  description = "Secrets Manager ARN containing NEXTAUTH_SECRET"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL for pushing container images"
}

output "github_oidc_provider_arn" {
  value       = aws_iam_openid_connect_provider.github.arn
  description = "IAM OIDC provider ARN for GitHub Actions"
}

output "github_actions_deploy_role_arn" {
  value       = aws_iam_role.github_actions_deploy.arn
  description = "IAM role ARN for GitHub Actions OIDC deployments"
}

output "sftp_endpoint" {
  value       = aws_transfer_server.this.endpoint
  description = "AWS Transfer Family endpoint"
}

output "sftp_usernames" {
  value       = keys(aws_transfer_user.clients)
  description = "Provisioned SFTP usernames"
}

output "sftp_bucket" {
  value       = aws_s3_bucket.transfer.bucket
  description = "S3 bucket backing SFTP uploads"
}

output "cloudwatch_log_group" {
  value       = aws_cloudwatch_log_group.app.name
  description = "CloudWatch log group for Lambda"
}

output "lambda_function_arn" {
  value       = aws_lambda_function.web.arn
  description = "Lambda function ARN"
}
