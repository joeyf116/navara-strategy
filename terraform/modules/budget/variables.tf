variable "budget_name" {
  description = "Name of the AWS Budget"
  type        = string
}

variable "monthly_budget_limit" {
  description = "Monthly cost budget limit"
  type        = number
}

variable "budget_currency" {
  description = "Currency unit for the budget (e.g. USD)"
  type        = string
  default     = "USD"
}

variable "budget_alert_emails" {
  description = "Email addresses subscribed to budget alert notifications"
  type        = list(string)
  default     = []
}

variable "enable_budget_alerts" {
  description = "Enable alert notifications; the budget itself is always created"
  type        = bool
  default     = true
}

variable "actual_alert_thresholds" {
  description = "Percent-of-budget thresholds that trigger alerts on ACTUAL spend"
  type        = list(number)
  default     = [50, 80, 100]
}

variable "forecasted_alert_thresholds" {
  description = "Percent-of-budget thresholds that trigger alerts on FORECASTED spend"
  type        = list(number)
  default     = [80, 100]
}

variable "cost_filter_tags" {
  description = "Optional map of cost-allocation tag key/value pairs used to scope the budget (tags must be activated in the Billing console)"
  type        = map(string)
  default     = {}
}
