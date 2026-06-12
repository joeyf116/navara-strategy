# -----------------------------------------------------------------------------
# Lambda web app – Next.js container image behind a Function URL
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${var.project_name}-web"
  retention_in_days = var.log_retention_days

  tags = local.tags_web
}

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

  tags = local.tags_web
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
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser"
        ]
        Resource = aws_cognito_user_pool.this.arn
      }
    ]
  })
}

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
      # Referencing aws_lambda_function_url.web here would create a
      # dependency cycle (the URL depends on this function). When empty, the
      # app falls back to "$${NEXTAUTH_URL}/api/dav" at runtime — the
      # CloudFront domain, whose Lambda@Edge behavior tunnels WebDAV verbs.
      WEBDAV_URL          = var.webdav_url
      EXCEL_IMPORT_PREFIX = "excel-imports"
      DATABASE_URL        = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.excel.address}:5432/${var.db_name}?sslmode=require"
    }
  }

  # Empty lists detach the function from the VPC (removing the block alone
  # would not). RDS is reachable either way via its public endpoint.
  vpc_config {
    subnet_ids         = var.enable_lambda_vpc ? aws_subnet.private[*].id : []
    security_group_ids = var.enable_lambda_vpc ? [aws_security_group.app.id] : []
  }

  tags = local.tags_web
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
