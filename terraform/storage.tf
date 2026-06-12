# -----------------------------------------------------------------------------
# S3 – SFTP transfer bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "transfer" {
  bucket        = "${var.project_name}-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.s3_force_destroy

  tags = local.tags_storage
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

# Cost control: versioning is enabled, so without lifecycle rules every
# overwrite/delete keeps its old version forever. Noncurrent versions remain
# recoverable for var.s3_noncurrent_version_expiration_days, then expire.
resource "aws_s3_bucket_lifecycle_configuration" "transfer" {
  bucket = aws_s3_bucket.transfer.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_expiration_days
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
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
