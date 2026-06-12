# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

resource "random_password" "nextauth_secret" {
  length  = 48
  special = true
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name = "${var.project_name}/nextauth-secret"

  tags = local.tags_web
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id     = aws_secretsmanager_secret.nextauth_secret.id
  secret_string = random_password.nextauth_secret.result
}

resource "aws_secretsmanager_secret" "cognito_client_id" {
  name = "${var.project_name}/cognito-client-id"

  tags = local.tags_auth
}

resource "aws_secretsmanager_secret_version" "cognito_client_id" {
  secret_id     = aws_secretsmanager_secret.cognito_client_id.id
  secret_string = aws_cognito_user_pool_client.this.id
}

resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name = "${var.project_name}/cognito-client-secret"

  tags = local.tags_auth
}

resource "aws_secretsmanager_secret_version" "cognito_client_secret" {
  secret_id     = aws_secretsmanager_secret.cognito_client_secret.id
  secret_string = aws_cognito_user_pool_client.this.client_secret
}
