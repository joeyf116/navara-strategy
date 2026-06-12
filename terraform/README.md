# Infrastructure (Terraform)

AWS infrastructure for the Navara Strategy portal: a Next.js web app on Lambda behind CloudFront, Cognito authentication, an AWS Transfer Family SFTP endpoint over S3, and a PostgreSQL RDS instance fed by an Excel-parser Lambda.

## Provider decision

AWS was re-evaluated against Azure, GCP, and smaller platforms (Vercel, Cloudflare, Fly.io, Render, DigitalOcean) and **kept**:

- The dominant cost (~$216/mo of an ~$235–250/mo baseline) is the Transfer Family SFTP endpoint, which is core product functionality. Azure Blob SFTP costs the same ($0.30/hr) and cannot replicate the custom Cognito-backed identity provider with per-session S3 scoping; GCP has no managed SFTP at all (self-hosting SFTPGo would trade a managed service for an operational liability).
- Cognito password hashes are not exportable — any migration forces password resets for every external partner across both web and SFTP.
- Everything that could be cheaper elsewhere is already near-zero here: the web Lambda scales to zero, RDS is the smallest tier, NAT is removed by default, and budgets/lifecycle/log-retention are in place.
- Smaller platforms (Vercel, Cloudflare, Fly, Render) offer no managed SFTP, no WebDAV verb tunneling, and no equivalent IdP; Vercel cannot run the custom `dav-gateway` server model.

Net: migration would cost weeks, disrupt every partner's credentials, and save approximately nothing. Re-evaluate only if partner SFTP usage ends — at that point deleting `aws_transfer_server.this` removes the dominant cost and the calculus for lighter platforms changes.

## Architecture overview

```
Browser ──> CloudFront ──> Lambda Function URL ──> Next.js web Lambda
                                                     │
SFTP client ──> Transfer Family ──> sftp-auth Lambda ─┤──> Cognito (auth)
                      │                               ├──> S3 transfer bucket
                      └───────────────────────────────┤──> RDS PostgreSQL
                                                      │
S3 excel-imports/* event ──> excel-parser Lambda ─────┘
```

| File | Contents |
|---|---|
| `main.tf` | Shared data sources |
| `networking.tf` | Security groups, optional NAT/private subnets, S3 gateway endpoint |
| `cognito.tf` | User pool, app clients, post-confirmation Lambda |
| `secrets.tf` | Secrets Manager entries |
| `ecr.tf` | Container registry + lifecycle policy |
| `deploy.tf` | GitHub Actions OIDC deploy role |
| `storage.tf` | S3 transfer bucket, encryption, versioning, lifecycle |
| `transfer.tf` | Transfer Family SFTP server + auth Lambda + user roles |
| `web.tf` | Next.js Lambda, Function URL, exec IAM |
| `cloudfront.tf` | CDN, cache policies |
| `rds.tf` | PostgreSQL instance + Excel-parser Lambda |
| `budgets.tf` | AWS Budgets (uses `modules/budget`) |
| `moved.tf` | State moves for resources that gained `count` |

All resources carry `Project`, `Environment`, `Service`, `ManagedBy`, `Component`, and (when set) `Owner` / `CostCenter` tags. Activate `Environment` and `Component` as **cost-allocation tags** in the Billing console to use them in Cost Explorer and budget filters.

## Cost optimization decisions

| Decision | Monthly impact | Notes |
|---|---|---|
| Lambdas run **outside** the VPC by default (`enable_lambda_vpc = false`) | ~−$33 + NAT data charges | RDS is publicly accessible, so VPC attachment added no security boundary. Set the variable to `true` to restore the NAT architecture. |
| S3 lifecycle rules added | Grows over time | Noncurrent versions expire after `s3_noncurrent_version_expiration_days` (default 30); incomplete multipart uploads abort after 7 days. **Old object versions become unrecoverable after the window.** |
| Explicit log groups with retention for all four Lambdas | Small, grows over time | Previously the sftp-auth and post-confirmation Lambdas auto-created never-expire log groups. |
| Removed unused CloudFront origin-request policy and a redundant public `lambda:InvokeFunction` permission | $0 | Dead config; the Function URL only needs `lambda:InvokeFunctionUrl`. |
| Kept: Transfer Family SFTP server | ~$216 (dominant cost) | $0.30/hr always-on + $0.04/GB. Core functionality. If partner SFTP usage ends, deleting `aws_transfer_server.this` is the single biggest saving — the web/WebDAV portal serves the same bucket. |
| Kept: `db.t3.micro` RDS, no Multi-AZ | — | Already minimal. Consider `db.t4g.micro` (~10% cheaper, brief restart to apply). |
| RDS backups now default to 7 days, with deletion protection and a final snapshot on destroy | Small backup-storage cost | Production-safety defaults. Set `db_backup_retention_period = 0`, `db_deletion_protection = false`, `db_skip_final_snapshot = true` for disposable environments. **Enabling backups on an existing 0-day instance applies during the next maintenance window (brief outage).** |
| Kept: CloudFront `PriceClass_100`, ECR keep-30-images | — | Already cost-appropriate. |

Other notes:
- `lambda_architecture = "arm64"` would cut web-Lambda compute ~20%, but requires the container image to be built for arm64 — change the Docker build first.
- RDS still defaults to `0.0.0.0/0:5432` for external ODBC compatibility, but the CIDR list is now the `db_public_cidr_blocks` variable — restrict it to known office/VPN IPs as soon as they are available.

## Deploy role (least privilege)

The GitHub Actions deploy role no longer uses `AdministratorAccess`. Two inline policies in `deploy.tf` grant:

- the service APIs Terraform manages (`ecr`, `lambda`, `cloudfront`, `cognito-idp`, `transfer`, `rds`, `secretsmanager`, `budgets`, `logs`), S3 scoped to `navara-sftp-*` buckets plus the state bucket, DynamoDB scoped to the lock table, and an explicit allowlist of EC2 networking actions (no instance APIs);
- IAM scoped to `navara-sftp-*` roles and the GitHub OIDC provider, with `iam:PassRole` conditioned on the Lambda/Lambda@Edge/Transfer services.

**Required:** set `tf_state_bucket` and `tf_lock_table` (CI passes them automatically as `TF_VAR_*` from the `TF_STATE_BUCKET`/`TF_LOCK_TABLE` repository variables). If they are unset, the role loses state access after `AdministratorAccess` is detached and the next `terraform init` in CI fails.

**Rollback:** if a deploy fails with `AccessDenied`, re-attach `AdministratorAccess` to the role via console/CLI, add the missing action to `deploy.tf`, apply, then detach it again.

## Budgets

Two budgets are managed via `modules/budget`:

- **Account budget** (always created): `monthly_budget_limit` (default 300 USD).
- **Environment budget** (optional): set `environment_budget_limit` to enable; filters spend by the `Environment` tag (must be activated as a cost-allocation tag first).

Alerts fire at **50% / 80% / 100% of actual** spend and **80% / 100% of forecasted** spend, emailed to `budget_alert_emails`. Alerts are skipped when the email list is empty or `enable_budget_alerts = false`; the budgets themselves always exist.

To adjust thresholds, override the module defaults in `budgets.tf`:

```hcl
module "account_budget" {
  # ...
  actual_alert_thresholds     = [60, 90, 100]
  forecasted_alert_thresholds = [90, 110]
}
```

## Required variables

No-default variables you must set (see `terraform.tfvars.example`):

| Variable | Purpose |
|---|---|
| `app_image_identifier` | ECR image URI for the web Lambda |
| `app_public_url` | Public HTTPS base URL (CloudFront) for Auth.js |
| `cognito_domain` | Unique Cognito hosted-UI domain prefix |
| `cognito_callback_urls` / `cognito_logout_urls` | OAuth redirect allowlists |

Key cost variables: `monthly_budget_limit`, `budget_currency`, `budget_alert_emails`, `enable_budget_alerts`, `environment_budget_limit`, `enable_lambda_vpc`, `log_retention_days`, `s3_noncurrent_version_expiration_days`, `owner`, `cost_center`.

## Deployment

**Via GitHub Actions (preferred):** deployment is manual-only — run the **Manual Deploy** workflow from the Actions tab, choosing `plan` or `apply` plus image-build / Terraform toggles. Nothing applies on push or merge. See the repository root README ("CI/CD") for the full workflow guide and the recommended GitHub Environment approval gate. CI (`ci.yml`) runs `terraform fmt -check` and `terraform validate` on every PR and push without AWS credentials.

**Locally:**

```bash
cd terraform
terraform init -backend-config=...   # S3 backend (partial config)
terraform fmt -check
terraform validate
terraform plan -out=tfplan           # review carefully — see notes below
terraform apply tfplan
```

### One-time imports for existing deployments

The sftp-auth and post-confirmation Lambdas previously auto-created their log groups. Import them once or apply fails with "resource already exists":

```bash
terraform import aws_cloudwatch_log_group.sftp_auth /aws/lambda/navara-sftp-sftp-auth
terraform import aws_cloudwatch_log_group.post_confirmation /aws/lambda/navara-sftp-post-confirmation
```

### Plan expectations on first apply after this refactor

- **Destroyed (intended, `enable_lambda_vpc = false`):** NAT Gateway, NAT EIP, 2 private subnets, private route table + associations, the unused `aws_cloudfront_origin_request_policy.all_viewer`, and `aws_lambda_permission.web_public_invoke`.
- **Updated in place:** both VPC-attached Lambdas detach from the VPC (ENI cleanup can take up to ~20 minutes; the functions keep serving during the change), tag updates across most resources.
- **Created:** budgets, S3 lifecycle configuration, two log groups (after import they become updates).
- **No replacements expected.** `moved.tf` preserves the NAT-path resources' addresses if you keep `enable_lambda_vpc = true` instead.
- The web app keeps reaching RDS via the instance's public endpoint (its security group already allows this), and Cognito/S3 via public APIs.

### Estimating cost before applying

- Run [Infracost](https://www.infracost.io/) against the plan: `infracost breakdown --path .`
- Or inspect `terraform plan` output and price the always-on items: Transfer Family server (~$216/mo), RDS db.t3.micro (~$13/mo + storage), NAT Gateway if re-enabled (~$33/mo + $0.045/GB), CloudFront/Lambda/S3 per usage.

### Rollback

Set `enable_lambda_vpc = true` to recreate the NAT/private-subnet architecture (new NAT EIP will differ). All other changes are additive or tag-only.
