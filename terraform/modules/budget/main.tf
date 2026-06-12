# Reusable monthly cost budget with actual + forecasted spend alerts.
#
# Notifications require at least one subscriber, so alert blocks are only
# generated when alerts are enabled AND at least one email is provided.

locals {
  alerts_active = var.enable_budget_alerts && length(var.budget_alert_emails) > 0
}

resource "aws_budgets_budget" "this" {
  name         = var.budget_name
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_limit)
  limit_unit   = var.budget_currency
  time_unit    = "MONTHLY"

  dynamic "cost_filter" {
    for_each = var.cost_filter_tags

    content {
      name   = "TagKeyValue"
      values = [format("user:%s$%s", cost_filter.key, cost_filter.value)]
    }
  }

  dynamic "notification" {
    for_each = local.alerts_active ? var.actual_alert_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.budget_alert_emails
    }
  }

  dynamic "notification" {
    for_each = local.alerts_active ? var.forecasted_alert_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = var.budget_alert_emails
    }
  }
}
