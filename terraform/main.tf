# -----------------------------------------------------------------------------
# Data sources
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

locals {
  private_subnet_azs = slice(data.aws_availability_zones.available.names, 0, 2)
  lambda_origin_host = trimprefix(trimsuffix(aws_lambda_function_url.web.function_url, "/"), "https://")
}

# -----------------------------------------------------------------------------
# Networking – security groups
# -----------------------------------------------------------------------------

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "App Runner VPC connector security group"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL
# -----------------------------------------------------------------------------

# (Removed - replaced by S3-backed storage)

# -----------------------------------------------------------------------------
# Cognito – authentication
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool" "this" {
  name = "${var.project_name}-users"

  # Cognito does not allow modifying/removing schema attributes after creation.
  # We manage custom attributes via CLI/API, then ignore drift here.
  lifecycle {
    ignore_changes = [schema]
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "sftp_folder"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  # Maps the authenticated user to their company's S3 folder prefix.
  # For EXISTING pools this attribute must be added via the AWS CLI because
  # lifecycle.ignore_changes = [schema] prevents Terraform from modifying the schema:
  #   aws cognito-idp add-custom-attributes \
  #     --user-pool-id <POOL_ID> \
  #     --custom-attributes Name=company_id,AttributeDataType=String,Mutable=true
  schema {
    name                     = "company_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Fires after every successful sign-up confirmation (admin or self-service).
  # The Lambda creates the company's To_Navara/ and From_Navara/ folder stubs.
  lambda_config {
    post_confirmation = aws_lambda_function.post_confirmation.arn
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.project_name}-web-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.cognito_domain
  user_pool_id = aws_cognito_user_pool.this.id
}

# Super_Admin group — members bypass company folder restrictions and get full bucket access.
#
# Import block: on first apply the group may already exist in AWS (created outside Terraform).
# This import is idempotent — Terraform skips it if the resource is already in state.
import {
  to = aws_cognito_user_group.super_admin
  id = "${aws_cognito_user_pool.this.id}/Super_Admin"
}

resource "aws_cognito_user_group" "super_admin" {
  name         = "Super_Admin"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Full read/write access to all company folders in S3"
  precedence   = 0
}

# Separate app client used only by the SFTP auth Lambda(server-side, no secret needed).
# Uses ADMIN_USER_PASSWORD_AUTH so the Lambda can validate credentials on behalf of the user.
resource "aws_cognito_user_pool_client" "sftp_auth" {
  name         = "${var.project_name}-sftp-auth"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

# -----------------------------------------------------------------------------
# Post-Confirmation Lambda — auto-provisions company S3 folders
# -----------------------------------------------------------------------------

resource "aws_iam_role" "post_confirmation_lambda" {
  name = "${var.project_name}-post-confirmation-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "post_confirmation_basic" {
  role       = aws_iam_role.post_confirmation_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "post_confirmation_s3" {
  name = "${var.project_name}-post-confirmation-s3"
  role = aws_iam_role.post_confirmation_lambda.id

  # Needs GetObject (covers HeadObject) and PutObject to create .keep stubs.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "FolderProvision"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
        ]
        Resource = "${aws_s3_bucket.transfer.arn}/*"
      }
    ]
  })
}

data "archive_file" "post_confirmation" {
  type        = "zip"
  source_file = "${path.module}/post-confirmation/index.py"
  output_path = "${path.module}/post-confirmation.zip"
}

resource "aws_lambda_function" "post_confirmation" {
  function_name    = "${var.project_name}-post-confirmation"
  role             = aws_iam_role.post_confirmation_lambda.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.post_confirmation.output_path
  source_code_hash = data.archive_file.post_confirmation.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.transfer.bucket
    }
  }

  tags = local.common_tags
}

# Grant Cognito permission to invoke this Lambda.
resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

resource "random_password" "nextauth_secret" {
  length  = 48
  special = true
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name = "${var.project_name}/nextauth-secret"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id     = aws_secretsmanager_secret.nextauth_secret.id
  secret_string = random_password.nextauth_secret.result
}

resource "aws_secretsmanager_secret" "cognito_client_id" {
  name = "${var.project_name}/cognito-client-id"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cognito_client_id" {
  secret_id     = aws_secretsmanager_secret.cognito_client_id.id
  secret_string = aws_cognito_user_pool_client.this.id
}

resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name = "${var.project_name}/cognito-client-secret"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cognito_client_secret" {
  secret_id     = aws_secretsmanager_secret.cognito_client_secret.id
  secret_string = aws_cognito_user_pool_client.this.client_secret
}

# -----------------------------------------------------------------------------
# ECR repository
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  force_delete         = var.ecr_force_delete

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the last ${var.ecr_max_image_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_max_image_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_repository_policy" "lambda_pull" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    Version = "2008-10-17"
    Statement = [
      {
        Sid    = "LambdaECRImageRetrievalPolicy"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# GitHub Actions OIDC deploy role
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  tags = local.common_tags
}

resource "aws_iam_role" "github_actions_deploy" {
  name = var.github_actions_deploy_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_deploy_admin" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# -----------------------------------------------------------------------------
# S3 – SFTP transfer bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "transfer" {
  bucket        = "${var.project_name}-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.s3_force_destroy

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "transfer" {
  bucket = aws_s3_bucket.transfer.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "transfer" {
  bucket = aws_s3_bucket.transfer.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "transfer" {
  bucket = aws_s3_bucket.transfer.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_cors_configuration" "transfer" {
  bucket = aws_s3_bucket.transfer.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.web_cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# -----------------------------------------------------------------------------
# AWS Transfer Family (SFTP) — custom Lambda identity provider
# -----------------------------------------------------------------------------

resource "aws_iam_role" "transfer_logging" {
  name = "${var.project_name}-transfer-logging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "transfer.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "transfer_logging" {
  role       = aws_iam_role.transfer_logging.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSTransferLoggingAccess"
}

# IAM role assumed by Transfer Family on behalf of each authenticated user.
# The SFTP auth Lambda returns this role ARN in its response.
resource "aws_iam_role" "transfer_user" {
  name = "${var.project_name}-transfer-user"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "transfer.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "transfer_user" {
  name = "${var.project_name}-transfer-user-policy"
  role = aws_iam_role.transfer_user.id

  # This is the MAXIMUM permission ceiling for authenticated company users.
  # The sftp_auth Lambda narrows access further via a per-request session policy
  # that restricts each user to only their own company's folder prefix.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.transfer.arn
      },
      {
        Sid    = "CompanyObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion",
        ]
        Resource = "${aws_s3_bucket.transfer.arn}/*"
      }
    ]
  })
}

# Super Admin IAM role — returned by the auth Lambda for members of the Super_Admin
# Cognito group.  No session-policy restriction is applied; they get full bucket access.
resource "aws_iam_role" "transfer_super_admin" {
  name = "${var.project_name}-transfer-super-admin"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "transfer.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "transfer_super_admin" {
  name = "${var.project_name}-transfer-super-admin-policy"
  role = aws_iam_role.transfer_super_admin.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.transfer.arn
      },
      {
        Sid    = "FullObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion",
          "s3:RestoreObject",
        ]
        Resource = "${aws_s3_bucket.transfer.arn}/*"
      }
    ]
  })
}

# IAM role for the SFTP auth Lambda
resource "aws_iam_role" "sftp_auth_lambda" {
  name = "${var.project_name}-sftp-auth-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "sftp_auth_basic" {
  role       = aws_iam_role.sftp_auth_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "sftp_auth_lambda" {
  name = "${var.project_name}-sftp-auth-lambda-policy"
  role = aws_iam_role.sftp_auth_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CognitoAdminAuth"
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminListGroupsForUser",
        ]
        Resource = aws_cognito_user_pool.this.arn
      },
      {
        Sid    = "ReadCompanyAccessMetadata"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
        ]
        Resource = "${aws_s3_bucket.transfer.arn}/${var.files_bucket_prefix}/.metadata/company-access/*"
      }
    ]
  })
}

# Package the SFTP auth Lambda from source
data "archive_file" "sftp_auth" {
  type        = "zip"
  source_file = "${path.module}/sftp-auth/index.mjs"
  output_path = "${path.module}/sftp-auth.zip"
}

resource "aws_lambda_function" "sftp_auth" {
  function_name    = "${var.project_name}-sftp-auth"
  role             = aws_iam_role.sftp_auth_lambda.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.sftp_auth.output_path
  source_code_hash = data.archive_file.sftp_auth.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      COGNITO_USER_POOL_ID    = aws_cognito_user_pool.this.id
      COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.sftp_auth.id
      TRANSFER_USER_ROLE_ARN  = aws_iam_role.transfer_user.arn
      SUPER_ADMIN_ROLE_ARN    = aws_iam_role.transfer_super_admin.arn
      S3_BUCKET               = aws_s3_bucket.transfer.bucket
      FILES_BUCKET_PREFIX     = var.files_bucket_prefix
    }
  }

  tags = local.common_tags
}

# Allow Transfer Family to invoke the auth Lambda
resource "aws_lambda_permission" "transfer_invoke_sftp_auth" {
  statement_id  = "AllowTransferFamilyInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sftp_auth.function_name
  principal     = "transfer.amazonaws.com"
  source_arn    = aws_transfer_server.this.arn
}

resource "aws_transfer_server" "this" {
  identity_provider_type = "AWS_LAMBDA"
  function               = aws_lambda_function.sftp_auth.arn
  protocols              = ["SFTP"]
  endpoint_type          = "PUBLIC"
  logging_role           = aws_iam_role.transfer_logging.arn

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# CloudWatch – log group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${var.project_name}-web"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Lambda private networking and outbound path (NAT)
# -----------------------------------------------------------------------------

resource "aws_subnet" "private" {
  count = 2

  vpc_id                  = data.aws_vpc.default.id
  cidr_block              = cidrsubnet(data.aws_vpc.default.cidr_block, 8, 200 + count.index)
  availability_zone       = local.private_subnet_azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-private-${count.index + 1}"
  })
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-nat-eip"
  })
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = data.aws_subnets.default.ids[0]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-nat"
  })

  depends_on = [aws_eip.nat]
}

resource "aws_route_table" "private" {
  vpc_id = data.aws_vpc.default.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-private-rt"
  })
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = data.aws_vpc.default.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(data.aws_route_tables.default.ids, [aws_route_table.private.id])

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Lambda web app – IAM
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_app" {
  name = "${var.project_name}-lambda-app-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.nextauth_secret.arn,
          aws_secretsmanager_secret.cognito_client_id.arn,
          aws_secretsmanager_secret.cognito_client_secret.arn
        ]
      },
      {
        Sid    = "S3TransferBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.transfer.arn,
          "${aws_s3_bucket.transfer.arn}/*"
        ]
      },
      {
        Sid    = "CognitoUserLookup"
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminListGroupsForUser"
        ]
        Resource = aws_cognito_user_pool.this.arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda web app – service
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "web" {
  function_name = "${var.project_name}-web"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = var.app_image_identifier
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size
  architectures = [var.lambda_architecture]

  image_config {
    command = ["node", "server.js"]
  }

  environment {
    variables = {
      NODE_ENV            = "production"
      PORT                = "3000"
      HOSTNAME            = "0.0.0.0"
      AUTH_COGNITO_ISSUER = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      AUTH_COGNITO_ID     = aws_cognito_user_pool_client.this.id
      AUTH_COGNITO_SECRET = aws_cognito_user_pool_client.this.client_secret
      NEXTAUTH_SECRET     = aws_secretsmanager_secret_version.nextauth_secret.secret_string
      NEXTAUTH_URL        = var.app_public_url
      AUTH_URL            = var.app_public_url
      AUTH_TRUST_HOST     = "true"
      FILES_BUCKET        = aws_s3_bucket.transfer.bucket
      FILES_BUCKET_PREFIX = var.files_bucket_prefix
      SFTP_ENDPOINT       = aws_transfer_server.this.endpoint
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.app.id]
  }

  tags = local.common_tags
}

resource "aws_lambda_function_url" "web" {
  function_name      = aws_lambda_function.web.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    expose_headers    = ["*"]
    max_age           = 86400
  }
}

resource "aws_lambda_permission" "web_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.web.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "web_public_invoke" {
  statement_id           = "AllowPublicInvokeViaFunctionUrl"
  action                 = "lambda:InvokeFunction"
  function_name          = aws_lambda_function.web.function_name
  principal              = "*"
}

# -----------------------------------------------------------------------------
# CloudFront distribution in front of Lambda URL
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_request_policy" "all_viewer" {
  name    = "${var.project_name}-all-viewer"
  comment = "Forward all viewer headers, cookies, and query strings"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${var.project_name}-no-cache"
  comment     = "Disable cache for dynamic Next.js routes"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false
  }
}

resource "aws_cloudfront_cache_policy" "static_cache" {
  name        = "${var.project_name}-static-cache"
  comment     = "Long cache for Next.js static assets"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} Next.js web distribution"
  price_class     = var.cloudfront_price_class

  origin {
    domain_name = local.lambda_origin_host
    origin_id   = "lambda-url-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "lambda-url-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.no_cache.id
    # Managed policy: AllViewerExceptHostHeader.
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "lambda-url-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static_cache.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  depends_on = [aws_lambda_function_url.web]

  tags = local.common_tags
}
