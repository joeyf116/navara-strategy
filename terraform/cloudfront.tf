# -----------------------------------------------------------------------------
# CloudFront distribution in front of Lambda URL
# -----------------------------------------------------------------------------

locals {
  lambda_origin_host = trimprefix(trimsuffix(aws_lambda_function_url.web.function_url, "/"), "https://")
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

    cache_policy_id = aws_cloudfront_cache_policy.no_cache.id
    # Managed policy: AllViewerExceptHostHeader.
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # WebDAV path – must be listed BEFORE the static-assets behavior so that it
  # takes priority.  The Lambda@Edge viewer-request function transforms non-
  # standard WebDAV methods (PROPFIND, MKCOL, …) into POST + X-WebDAV-Method
  # before CloudFront validates the verb, allowing them to pass to origin.
  # Authorization header forwarding is required for Basic-Auth app passwords.
  ordered_cache_behavior {
    path_pattern           = "/api/dav*"
    target_origin_id       = "lambda-url-origin"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    cache_policy_id = aws_cloudfront_cache_policy.no_cache.id
    # Managed policy: AllViewerExceptHostHeader — forwards Authorization,
    # Destination, Depth, If, Lock-Token, Overwrite, and all other viewer
    # headers except Host to the origin.
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

    lambda_function_association {
      event_type   = "viewer-request"
      lambda_arn   = aws_lambda_function.webdav_edge.qualified_arn
      include_body = false
    }
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

  depends_on = [
    aws_lambda_function_url.web,
    aws_lambda_function.webdav_edge,
  ]

  tags = local.tags_web
}
