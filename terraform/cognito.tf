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

  tags = local.tags_auth
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

  tags = local.tags_auth
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

# Pre-created so retention is controlled instead of the Lambda auto-creating a
# never-expire log group. Existing auto-created groups must be imported (see README).
resource "aws_cloudwatch_log_group" "post_confirmation" {
  name              = "/aws/lambda/${var.project_name}-post-confirmation"
  retention_in_days = var.log_retention_days

  tags = local.tags_auth
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

  depends_on = [aws_cloudwatch_log_group.post_confirmation]

  tags = local.tags_auth
}

# Grant Cognito permission to invoke this Lambda.
resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}
