# -----------------------------------------------------------------------------
# Shared data sources
#
# Resource definitions live in purpose-named files:
#   networking.tf  – security groups, optional NAT/private subnets, S3 endpoint
#   cognito.tf     – user pool, app clients, post-confirmation Lambda
#   secrets.tf     – Secrets Manager entries
#   ecr.tf         – container registry
#   deploy.tf      – GitHub Actions OIDC deploy role
#   storage.tf     – S3 transfer bucket + lifecycle
#   transfer.tf    – AWS Transfer Family (SFTP) + auth Lambda
#   web.tf         – Next.js Lambda web app + Function URL
#   cloudfront.tf  – CDN in front of the Lambda URL
#   rds.tf         – PostgreSQL + Excel parser Lambda
#   budgets.tf     – AWS Budgets cost guardrails
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_route_tables" "default" {
  vpc_id = data.aws_vpc.default.id
}
