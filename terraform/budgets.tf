# -----------------------------------------------------------------------------
# AWS Budgets — cost guardrails
#
# Account-level monthly budget plus an optional environment-scoped budget
# filtered by the Environment cost-allocation tag. Alert thresholds:
# 50/80/100% of actual spend and 80/100% of forecasted spend.
# -----------------------------------------------------------------------------

module "account_budget" {
  source = "./modules/budget"

  budget_name          = "${var.project_name}-account-monthly"
  monthly_budget_limit = var.monthly_budget_limit
  budget_currency      = var.budget_currency
  budget_alert_emails  = var.budget_alert_emails
  enable_budget_alerts = var.enable_budget_alerts
}

# Requires the Environment tag to be activated as a cost-allocation tag in the
# Billing console before the filter matches any spend.
module "environment_budget" {
  source = "./modules/budget"
  count  = var.environment_budget_limit != null ? 1 : 0

  budget_name          = "${var.project_name}-${var.environment}-monthly"
  monthly_budget_limit = var.environment_budget_limit
  budget_currency      = var.budget_currency
  budget_alert_emails  = var.budget_alert_emails
  enable_budget_alerts = var.enable_budget_alerts

  cost_filter_tags = {
    Environment = var.environment
  }
}
