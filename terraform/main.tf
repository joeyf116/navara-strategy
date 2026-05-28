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

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow PostgreSQL from app security group"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

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

resource "aws_db_subnet_group" "this" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids

  tags = local.common_tags
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_instance" "this" {
  identifier                = "${var.project_name}-postgres"
  allocated_storage         = 20
  max_allocated_storage     = 100
  db_name                   = var.database_name
  engine                    = "postgres"
  engine_version            = "16.1"
  instance_class            = var.database_instance_class
  username                  = var.database_username
  password                  = random_password.db.result
  db_subnet_group_name      = aws_db_subnet_group.this.name
  vpc_security_group_ids    = [aws_security_group.rds.id]
  publicly_accessible       = false
  skip_final_snapshot       = var.rds_skip_final_snapshot
  final_snapshot_identifier = var.rds_skip_final_snapshot ? null : "${var.project_name}-postgres-final"
  deletion_protection       = var.rds_deletion_protection
  storage_encrypted         = true

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Cognito – authentication
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool" "this" {
  name = "${var.project_name}-users"

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

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
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

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.project_name}/database-url"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${var.database_username}:${random_password.db.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.database_name}"
}

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

# -----------------------------------------------------------------------------
# AWS Transfer Family (SFTP)
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

resource "aws_transfer_server" "this" {
  identity_provider_type = "SERVICE_MANAGED"
  protocols              = ["SFTP"]
  endpoint_type          = "PUBLIC"
  logging_role           = aws_iam_role.transfer_logging.arn

  tags = local.common_tags
}

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

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.transfer.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.transfer.arn}/clients/${var.transfer_user_name}/*"
      }
    ]
  })
}

resource "aws_transfer_user" "client" {
  server_id = aws_transfer_server.this.id
  user_name = var.transfer_user_name
  role      = aws_iam_role.transfer_user.arn

  home_directory_type = "LOGICAL"
  home_directory_mappings {
    entry  = "/"
    target = "/${aws_s3_bucket.transfer.bucket}/clients/${var.transfer_user_name}"
  }

  tags = local.common_tags
}

resource "aws_transfer_ssh_key" "client" {
  server_id = aws_transfer_server.this.id
  user_name = aws_transfer_user.client.user_name
  body      = var.transfer_user_public_key
}

# -----------------------------------------------------------------------------
# CloudWatch – log group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/apprunner/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# App Runner – IAM
# -----------------------------------------------------------------------------

resource "aws_iam_role" "apprunner_ecr_access" {
  name = "${var.project_name}-apprunner-ecr"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.project_name}-apprunner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "tasks.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "apprunner_instance" {
  name = "${var.project_name}-apprunner-instance-policy"
  role = aws_iam_role.apprunner_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
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
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.app.arn}:*"
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# App Runner – networking & service
# -----------------------------------------------------------------------------

resource "aws_apprunner_vpc_connector" "this" {
  vpc_connector_name = "${var.project_name}-connector"
  subnets            = data.aws_subnets.default.ids
  security_groups    = [aws_security_group.app.id]

  tags = local.common_tags
}

resource "aws_apprunner_auto_scaling_configuration_version" "this" {
  auto_scaling_configuration_name = "${var.project_name}-scaling"

  max_concurrency = var.apprunner_max_concurrency
  max_size        = var.apprunner_max_size
  min_size        = var.apprunner_min_size

  tags = local.common_tags
}

resource "aws_apprunner_service" "this" {
  service_name = "${var.project_name}-web"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_repository_type = "ECR"
      image_identifier      = var.app_image_identifier

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          NODE_ENV             = "production"
          AUTH_COGNITO_ISSUER  = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
        }

        runtime_environment_secrets = {
          DATABASE_URL         = aws_secretsmanager_secret.database_url.arn
          NEXTAUTH_SECRET      = aws_secretsmanager_secret.nextauth_secret.arn
          AUTH_COGNITO_ID      = aws_secretsmanager_secret.cognito_client_id.arn
          AUTH_COGNITO_SECRET  = aws_secretsmanager_secret.cognito_client_secret.arn
        }
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = var.apprunner_cpu
    memory            = var.apprunner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.this.arn

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.this.arn
    }
  }

  tags = local.common_tags
}
