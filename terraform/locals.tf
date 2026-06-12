locals {
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Service     = var.project_name
    },
    var.owner != "" ? { Owner = var.owner } : {},
    var.cost_center != "" ? { CostCenter = var.cost_center } : {},
  )
}

# Per-component tags for cost allocation. Filter on the Component tag in
# Cost Explorer to see what each part of the stack costs.
locals {
  tags_networking = merge(local.common_tags, { Component = "networking" })
  tags_auth       = merge(local.common_tags, { Component = "auth" })
  tags_storage    = merge(local.common_tags, { Component = "storage" })
  tags_sftp       = merge(local.common_tags, { Component = "sftp" })
  tags_web        = merge(local.common_tags, { Component = "web" })
  tags_database   = merge(local.common_tags, { Component = "database" })
  tags_cicd       = merge(local.common_tags, { Component = "ci-cd" })
}
