output "budget_id" {
  value       = aws_budgets_budget.this.id
  description = "ID of the AWS Budget"
}

output "budget_arn" {
  value       = aws_budgets_budget.this.arn
  description = "ARN of the AWS Budget"
}

output "budget_name" {
  value       = aws_budgets_budget.this.name
  description = "Name of the AWS Budget"
}
