# -----------------------------------------------------------------------------
# AWS Transfer Family (SFTP) — custom Lambda identity provider
#
# COST NOTE: an always-on SFTP endpoint bills ~$0.30/hour (~$216/month) plus
# $0.04/GB transferred — this is the single largest line item in the stack.
# It is core product functionality (external partner SFTP access), so it is
# kept; if SFTP usage ever drops, the web/WebDAV portal covers the same bucket.
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

  tags = local.tags_sftp
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

  tags = local.tags_sftp
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

  tags = local.tags_sftp
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

  tags = local.tags_sftp
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

# Pre-created so retention is controlled instead of the Lambda auto-creating a
# never-expire log group. Existing auto-created groups must be imported (see README).
resource "aws_cloudwatch_log_group" "sftp_auth" {
  name              = "/aws/lambda/${var.project_name}-sftp-auth"
  retention_in_days = var.log_retention_days

  tags = local.tags_sftp
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
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.this.id
      COGNITO_CLIENT_ID      = aws_cognito_user_pool_client.sftp_auth.id
      TRANSFER_USER_ROLE_ARN = aws_iam_role.transfer_user.arn
      SUPER_ADMIN_ROLE_ARN   = aws_iam_role.transfer_super_admin.arn
      S3_BUCKET              = aws_s3_bucket.transfer.bucket
      FILES_BUCKET_PREFIX    = var.files_bucket_prefix
    }
  }

  depends_on = [aws_cloudwatch_log_group.sftp_auth]

  tags = local.tags_sftp
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

  tags = local.tags_sftp
}
