# State moves for the NAT-path resources, which gained `count` when the
# private-subnet architecture became optional (var.enable_lambda_vpc).
# With enable_lambda_vpc = true these preserve the existing resources;
# with the default (false) the old addresses are simply destroyed.

moved {
  from = aws_eip.nat
  to   = aws_eip.nat[0]
}

moved {
  from = aws_nat_gateway.this
  to   = aws_nat_gateway.this[0]
}

moved {
  from = aws_route_table.private
  to   = aws_route_table.private[0]
}
