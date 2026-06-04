# -----------------------------------------------------------------------------
# RDS PostgreSQL
# publicly_accessible = true allows ODBC connections from external tools.
# Lambda in the private subnet connects via VPC routing (no internet roundtrip).
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 24
  special = false
}

# Store the full connection string in Secrets Manager for operator reference.
resource "aws_secretsmanager_secret" "db_url" {
  name = "${var.project_name}/database-url"
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.excel.address}:5432/${var.db_name}?sslmode=require"

  depends_on = [aws_db_instance.excel]
}

# Security group:
#   - port 5432 from the web Lambda SG and the Excel parser Lambda SG (VPC path)
#   - port 5432 from 0.0.0.0/0 for external ODBC tools
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "PostgreSQL: VPC Lambda access + public ODBC"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "PostgreSQL from Lambda (VPC)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id, aws_security_group.excel_parser.id]
  }

  ingress {
    description = "PostgreSQL from internet (ODBC)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Use the default VPC's public subnets so publicly_accessible = true gets a public endpoint.
resource "aws_db_subnet_group" "rds" {
  name       = "${var.project_name}-rds-subnet-group"
  subnet_ids = data.aws_subnets.default.ids
  tags       = local.common_tags
}

resource "aws_db_instance" "excel" {
  identifier              = "${var.project_name}-excel"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  max_allocated_storage   = 500
  db_name                 = var.db_name
  username                = var.db_username
  password                = random_password.db_password.result
  publicly_accessible     = true
  vpc_security_group_ids  = [aws_security_group.rds.id]
  db_subnet_group_name    = aws_db_subnet_group.rds.name
  skip_final_snapshot     = true
  storage_encrypted       = true
  deletion_protection     = false
  backup_retention_period = 7

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Excel Parser Lambda
# Triggered by S3 object-created events under the excel-imports/ prefix.
# Downloads the Excel file as a Node.js stream, batch-inserts rows into RDS.
# -----------------------------------------------------------------------------

resource "aws_security_group" "excel_parser" {
  name        = "${var.project_name}-excel-parser-sg"
  description = "Excel parser Lambda: egress to RDS and S3"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_iam_role" "excel_parser_lambda" {
  name = "${var.project_name}-excel-parser-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "excel_parser_basic" {
  role       = aws_iam_role.excel_parser_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "excel_parser_vpc" {
  role       = aws_iam_role.excel_parser_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "excel_parser_app" {
  name = "${var.project_name}-excel-parser-policy"
  role = aws_iam_role.excel_parser_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3ReadExcel"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.transfer.arn}/excel-imports/*"
      }
    ]
  })
}

# Build the Lambda zip: install npm deps, then archive the directory.
# Prerequisite: Node.js and npm must be available at `terraform apply` time.
resource "null_resource" "excel_parser_build" {
  triggers = {
    package_hash = filemd5("${path.module}/excel-parser/package.json")
    index_hash   = filemd5("${path.module}/excel-parser/index.mjs")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev"
    working_dir = "${path.module}/excel-parser"
  }
}

data "archive_file" "excel_parser" {
  type        = "zip"
  source_dir  = "${path.module}/excel-parser"
  output_path = "${path.module}/excel-parser.zip"

  depends_on = [null_resource.excel_parser_build]
}

resource "aws_cloudwatch_log_group" "excel_parser" {
  name              = "/aws/lambda/${var.project_name}-excel-parser"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "excel_parser" {
  function_name    = "${var.project_name}-excel-parser"
  role             = aws_iam_role.excel_parser_lambda.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.excel_parser.output_path
  source_code_hash = data.archive_file.excel_parser.output_base64sha256
  timeout          = 900  # 15-minute hard limit for large files
  memory_size      = 2048 # 2 GB for in-memory row processing

  ephemeral_storage {
    size = 1024 # 1 GB /tmp — in case ExcelJS needs temp space
  }

  environment {
    variables = {
      DATABASE_URL = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.excel.address}:5432/${var.db_name}?sslmode=require"
    }
  }

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.excel_parser.id]
  }

  depends_on = [
    aws_cloudwatch_log_group.excel_parser,
    aws_iam_role_policy_attachment.excel_parser_vpc,
  ]

  tags = local.common_tags
}

resource "aws_lambda_permission" "s3_invoke_excel_parser" {
  statement_id  = "AllowS3InvokeExcelParser"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.excel_parser.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.transfer.arn
}

# S3 event → trigger parser for any file under the excel-imports/ prefix.
resource "aws_s3_bucket_notification" "excel_import_trigger" {
  bucket = aws_s3_bucket.transfer.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.excel_parser.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "excel-imports/"
  }

  depends_on = [aws_lambda_permission.s3_invoke_excel_parser]
}
