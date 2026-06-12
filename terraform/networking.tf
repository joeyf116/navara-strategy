# -----------------------------------------------------------------------------
# Networking
#
# The private-subnet + NAT Gateway path is OPTIONAL (var.enable_lambda_vpc,
# default false). RDS is publicly accessible, so VPC-attaching the Lambdas adds
# no security boundary while the NAT Gateway costs ~$33/month + data charges.
# The S3 gateway endpoint is free and kept for all route tables.
# -----------------------------------------------------------------------------

locals {
  private_subnet_azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

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

  tags = local.tags_networking
}

resource "aws_subnet" "private" {
  count = var.enable_lambda_vpc ? 2 : 0

  vpc_id                  = data.aws_vpc.default.id
  cidr_block              = cidrsubnet(data.aws_vpc.default.cidr_block, 8, 200 + count.index)
  availability_zone       = local.private_subnet_azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.tags_networking, {
    Name = "${var.project_name}-private-${count.index + 1}"
  })
}

resource "aws_eip" "nat" {
  count = var.enable_lambda_vpc ? 1 : 0

  domain = "vpc"

  tags = merge(local.tags_networking, {
    Name = "${var.project_name}-nat-eip"
  })
}

resource "aws_nat_gateway" "this" {
  count = var.enable_lambda_vpc ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = data.aws_subnets.default.ids[0]

  tags = merge(local.tags_networking, {
    Name = "${var.project_name}-nat"
  })

  depends_on = [aws_eip.nat]
}

resource "aws_route_table" "private" {
  count = var.enable_lambda_vpc ? 1 : 0

  vpc_id = data.aws_vpc.default.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[0].id
  }

  tags = merge(local.tags_networking, {
    Name = "${var.project_name}-private-rt"
  })
}

resource "aws_route_table_association" "private" {
  count = var.enable_lambda_vpc ? 2 : 0

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

# Gateway endpoints are free — keeps S3 traffic off the NAT path when the VPC
# architecture is enabled, and is harmless otherwise.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = data.aws_vpc.default.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(data.aws_route_tables.default.ids, aws_route_table.private[*].id)

  tags = local.tags_networking
}
