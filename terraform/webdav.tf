# -----------------------------------------------------------------------------
# Lambda@Edge – WebDAV method tunneling
#
# CloudFront only forwards the seven standard HTTP verbs. WebDAV clients send
# PROPFIND, PROPPATCH, MKCOL, MOVE, COPY, LOCK, UNLOCK which CloudFront would
# otherwise reject with 403 before the request ever reaches Lambda.
#
# This viewer-request Lambda@Edge function runs at the CloudFront edge. For
# any non-standard WebDAV method targeting /api/dav*, it:
#   1. Copies the original method into X-WebDAV-Method header
#   2. Changes the method to POST
#
# The dav-gateway inside the container then forwards POST + X-WebDAV-Method
# to Next.js, which dispatches on the header — exactly the same path used by
# the dev gateway for local testing.
#
# Lambda@Edge viewer-request functions are invoked BEFORE CloudFront validates
# the HTTP method, so non-standard verbs reach the function intact.
# -----------------------------------------------------------------------------

locals {
  # Inline Node.js source for the edge function.
  webdav_edge_source = <<-JS
    'use strict';
    var TUNNELED = new Set(['PROPFIND','PROPPATCH','MKCOL','MOVE','COPY','LOCK','UNLOCK']);
    exports.handler = function(event, context, callback) {
      var request = event.Records[0].cf.request;
      if (TUNNELED.has(request.method)) {
        request.headers['x-webdav-method'] = [{ key: 'X-WebDAV-Method', value: request.method }];
        request.method = 'POST';
      }
      callback(null, request);
    };
  JS
}

data "archive_file" "webdav_edge" {
  type        = "zip"
  output_path = "${path.module}/.terraform/webdav-edge.zip"

  source {
    content  = local.webdav_edge_source
    filename = "index.js"
  }
}

resource "aws_iam_role" "lambda_edge_webdav" {
  name = "${var.project_name}-lambda-edge-webdav"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com",
          ]
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags_web
}

resource "aws_iam_role_policy_attachment" "lambda_edge_webdav_basic" {
  role       = aws_iam_role.lambda_edge_webdav.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "webdav_edge" {
  function_name    = "${var.project_name}-webdav-edge"
  role             = aws_iam_role.lambda_edge_webdav.arn
  filename         = data.archive_file.webdav_edge.output_path
  source_code_hash = data.archive_file.webdav_edge.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"

  # Lambda@Edge requires a published version; CloudFront references the
  # qualified ARN (function:version).
  publish = true

  tags = local.tags_web
}
