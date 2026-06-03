# navara-strategy

Secure file sharing portal built with Next.js, deployed to AWS Lambda (container image) behind CloudFront. **All application state is stored in S3** — there is no database.

## Architecture

```mermaid
flowchart LR
    U[User Browser] --> CF[CloudFront]
    CF --> LFU[Lambda Function URL]
    LFU --> APP[Next.js App on Lambda]

    APP --> COG[Cognito via NextAuth]
    APP --> S3[(S3 Bucket)]
    APP --> TF[AWS Transfer Family SFTP]

    subgraph S3 Layout
      S3 --> UF[uploads/user-files/{email}/...]
      S3 --> AP[uploads/.metadata/app-passwords/{email}.json]
      S3 --> SH[uploads/.metadata/shares/{email}.json]
      S3 --> LK[uploads/.metadata/locks/{token}.json]
      S3 --> IX[uploads/.metadata/shared-files-index.json]
    end
```

Production URL: <https://d2i0sz4mcgor37.cloudfront.net>

### Storage Model

All mutable state lives in a single S3 bucket. No database is required.

| S3 key pattern                                  | Content                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `{prefix}/user-files/{email}/path/to/file`      | User file content                                    |
| `{prefix}/user-files/{email}/folder/`           | Folder marker (zero-byte, `application/x-directory`) |
| `{prefix}/.metadata/app-passwords/{email}.json` | App password records for WebDAV Basic Auth           |
| `{prefix}/.metadata/shares/{email}.json`        | Share grants for a grantee                           |
| `{prefix}/.metadata/locks/{token}.json`         | Active WebDAV lock                                   |
| `{prefix}/.metadata/shared-files-index.json`    | Admin shared-files index                             |

`{prefix}` is controlled by the `FILES_BUCKET_PREFIX` environment variable (default: `uploads`).

In local development (no `FILES_BUCKET` env var), each of these falls back to a parallel path under `uploads/` on the local filesystem.

### Runtime Components

- UI routes: [app](app). Authenticated dashboard at [app/(dashboard)](<app/(dashboard)>); unauthenticated share hub at [app/upload](app/upload).
- Auth: NextAuth backed by Cognito in production; dev credentials used locally. Config: [lib/auth.ts](lib/auth.ts).
- File APIs: REST endpoints under `app/api/files/` (shared files + virtual tree), WebDAV at `app/api/dav/`, and settings at `app/api/settings/`. See [Project Paths](#project-paths) for the full breakdown.

### RBAC Model

Supported roles: `super_admin`, `admin`, `tenant_user`, `read_only_auditor`. Cognito groups are mapped to roles in [lib/auth.ts](lib/auth.ts). Unmapped users default to `tenant_user`.

---

## CI/CD — Push to Main

**Pushing to `main` automatically runs the full deploy pipeline** via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). No manual steps needed for normal deployments.

### Pipeline Sequence

```
push to main
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 1. CI Gate                                              │
│    lint → tsc --noEmit → next build                     │
│    Fails fast — nothing deploys if CI fails             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Terraform Bootstrap (ECR)                            │
│    terraform apply -target=aws_ecr_repository.app       │
│    Idempotent — safe to run every deploy                │
│    Ensures ECR exists before the image build step       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Build & Push Image                                   │
│    docker build -f Dockerfile.lambda                    │
│    Tags: :<sha-short>  and  :latest                     │
│    Pushes both tags to ECR                              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Terraform Apply (full infra)                         │
│    terraform plan → terraform apply                     │
│    Updates Lambda image_uri to the new :<sha> tag       │
│    Creates/updates: Lambda, Cognito, CloudFront,        │
│      S3, Transfer Family, IAM, VPC, NAT                 │
│    No-op if nothing changed (plan exit 0)               │
└─────────────────────────────────────────────────────────┘
```

- The `concurrency: group: deploy-production` lock prevents overlapping deploys. In-flight runs are **never** cancelled.
- [.github/workflows/ci.yml](.github/workflows/ci.yml) is a **PR gate only** — runs lint/typecheck/build on every pull request to `main`. It does not trigger on pushes (deploy.yml handles those).
- There is no database migration step. S3 JSON files are schema-less and backwards-compatible by design.

### Required Repository Secrets

| Secret                | Description                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN assumed via OIDC (output of `terraform output github_actions_deploy_role_arn`) |

### Required Repository Variables

| Variable                | Production Value                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`            | `us-east-1`                                                                                                                  |
| `ECR_REPOSITORY`        | `navara-sftp`                                                                                                                |
| `TF_STATE_BUCKET`       | `navara-sftp-terraform-state`                                                                                                |
| `TF_STATE_KEY`          | `production/terraform.tfstate`                                                                                               |
| `TF_LOCK_TABLE`         | `navara-sftp-terraform-locks`                                                                                                |
| `COGNITO_DOMAIN`        | `navara-sftp-<account-id>`                                                                                                   |
| `APP_PUBLIC_URL`        | `https://<your-distribution>.cloudfront.net`                                                                                 |
| `COGNITO_CALLBACK_URLS` | `["https://<your-distribution>.cloudfront.net/api/auth/callback/cognito","http://localhost:3000/api/auth/callback/cognito"]` |
| `COGNITO_LOGOUT_URLS`   | `["https://<your-distribution>.cloudfront.net/login","http://localhost:3000/login"]`                                         |

---

## First-Time Bootstrap

> **Prerequisites:** The Terraform state S3 bucket and DynamoDB lock table must exist before `terraform init`. Create them once manually via the AWS console or CLI, then Terraform manages everything else.

The OIDC IAM role that GitHub Actions uses is itself managed by Terraform. Bootstrap once from a workstation with AWS credentials:

```powershell
cd terraform

terraform init `
  -backend-config="bucket=navara-sftp-terraform-state" `
  -backend-config="key=production/terraform.tfstate" `
  -backend-config="region=us-east-1" `
  -backend-config="dynamodb_table=navara-sftp-terraform-locks"

terraform apply `
  -var="app_image_identifier=public.ecr.aws/docker/library/node:22-alpine"
```

Copy the `github_actions_deploy_role_arn` output and set it as the `AWS_DEPLOY_ROLE_ARN` repository secret. All subsequent deploys run fully automated via push to `main`.

---

## Manual Fallback Deployment

If you need to deploy without GitHub Actions:

```powershell
# 1. Build and push image
$SHA = git rev-parse --short HEAD
$ACCOUNT = aws sts get-caller-identity --query Account --output text
$ECR = "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/navara-sftp"
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR
docker build -f Dockerfile.lambda -t "$ECR:$SHA" -t "$ECR:latest" .
docker push "$ECR:$SHA"
docker push "$ECR:latest"

# 2. Apply Terraform
cd terraform
terraform apply `
  -var="app_image_identifier=$ECR:$SHA"
```

No database migration step is needed.

---

## tfvars → GitHub Variables Mapping

| Terraform variable      | GitHub variable         |
| ----------------------- | ----------------------- |
| `aws_region`            | `AWS_REGION`            |
| `project_name`          | `ECR_REPOSITORY`        |
| `cognito_domain`        | `COGNITO_DOMAIN`        |
| `app_public_url`        | `APP_PUBLIC_URL`        |
| `cognito_callback_urls` | `COGNITO_CALLBACK_URLS` |
| `cognito_logout_urls`   | `COGNITO_LOGOUT_URLS`   |

> `transfer_users` (SSH public keys) is committed directly in [terraform/terraform.tfvars](terraform/terraform.tfvars) — public keys are not secrets.

---

## Managing Clients (SFTP + Web Portal)

Clients use **one set of credentials** for everything:

| Access method | Username | Password/Key          |
| ------------- | -------- | --------------------- |
| Web portal    | Email    | Cognito password      |
| SFTP          | Email    | Same Cognito password |

A small Lambda (`terraform/sftp-auth/index.mjs`) sits between Transfer Family and Cognito. When a client connects via SFTP, Transfer Family calls the Lambda, which validates the password against Cognito and returns the correct S3 home directory. No SSH keys, no separate SFTP user accounts to maintain.

Each client's files live at:

```
s3://{bucket}/clients/{sanitized-email}/
# e.g. client@acme.com → clients/client-acme-com/
```

To give a user a custom folder name (e.g. a shared company bucket), set the `custom:sftp_folder` attribute on their Cognito account — the Lambda will use it in preference to the derived name.

### Adding a new client

**Step 1 — Create their Cognito account:**

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --temporary-password "TempPass123!" \
  --user-attributes \
    Name=email,Value=client@example.com \
    Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1 \
  --profile joey-navara

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --group-name tenant_user \
  --region us-east-1 \
  --profile joey-navara
```

`--message-action SUPPRESS` skips the Cognito welcome email so you control how credentials are delivered.

> You can also do this in **AWS Console → Cognito → User Pools → your pool → Users → Create user**.

**Step 2 — (Optional) Set a custom S3 folder:**

Skip this if the derived name (`client-example-com`) is fine. Set it if you want a specific folder name (e.g. for a company):

```bash
# First add the custom attribute to the user pool (one-time, per pool):
aws cognito-idp add-custom-attributes \
  --user-pool-id $POOL_ID \
  --custom-attributes Name=sftp_folder,AttributeDataType=String,Mutable=true \
  --region us-east-1 --profile joey-navara

# Then set it on the user:
aws cognito-idp admin-update-user-attributes \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --user-attributes Name=custom:sftp_folder,Value=clients/acme-corp \
  --region us-east-1 --profile joey-navara
```

**Step 3 — Send the client their credentials:**

```
Web portal: https://d2i0sz4mcgor37.cloudfront.net
SFTP host:  (from: terraform output sftp_endpoint)
SFTP port:  22
Username:   client@example.com     ← same for both web and SFTP
Password:   TempPass123!           ← prompted to set permanent password on first web login
```

The client must log into the web portal first to set their permanent password before SFTP will work. If they try SFTP with the temporary password, the Lambda denies them (Cognito returns a NEW_PASSWORD_REQUIRED challenge, which cannot be completed over SFTP).

### Resetting a client's password

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --password "NewTempPass456!" \
  --no-permanent \
  --region us-east-1 --profile joey-navara
```

`--no-permanent` forces them to set a new password on next web portal login. Alternatively use `--permanent` to set a final password directly without requiring a change.

### Removing a client

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-delete-user \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --region us-east-1 --profile joey-navara
```

Deleting the Cognito user immediately revokes both web portal and SFTP access — there are no separate SSH keys or Transfer Family users to clean up.

> Their S3 files remain at `s3://navara-sftp-911788523695/clients/{folder}/`. Delete manually if required:
>
> ```bash
> aws s3 rm s3://navara-sftp-911788523695/clients/client-example-com/ --recursive --profile joey-navara
> ```

### Listing active clients

```bash
# All Cognito users (web portal + SFTP)
aws cognito-idp list-users \
  --user-pool-id $(terraform -chdir=terraform output -raw cognito_user_pool_id) \
  --region us-east-1 --profile joey-navara
```

### Viewing a client's files (admin)

```bash
# List
aws s3 ls s3://navara-sftp-911788523695/clients/client-example-com/ --profile joey-navara

# Download
aws s3 cp s3://navara-sftp-911788523695/clients/client-example-com/report.pdf ./report.pdf --profile joey-navara
```

You can also share files with clients through the web portal (admin dashboard → uploads tab).

### Migrating the existing `client-upload` SFTP user

The previous `client-upload` user authenticated via SSH key. To migrate:

1. Create a Cognito account for their email address (Step 1 above)
2. Set `custom:sftp_folder = clients/client-upload` so their existing S3 files are preserved (Step 2 above)
3. Send them their new credentials — they now use email + password instead of an SSH key
4. Their SFTP host will change (the Transfer Family server was recreated when switching identity providers) — send them the new host from `terraform output sftp_endpoint`

---

## Project Paths

| Path                                                                                   | Purpose                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [app](app)                                                                             | All Next.js routes                                   |
| [app/(dashboard)/files/page.tsx](<app/(dashboard)/files/page.tsx>)                     | Dashboard — virtual file tree UI                     |
| [app/(dashboard)/uploads/page.tsx](<app/(dashboard)/uploads/page.tsx>)                 | Dashboard — shared-file upload / inbox UI            |
| [app/(dashboard)/settings/page.tsx](<app/(dashboard)/settings/page.tsx>)               | Settings — app passwords + connection info           |
| [app/upload/page.tsx](app/upload/page.tsx)                                             | Standalone file-share hub (outside dashboard layout) |
| [app/login/page.tsx](app/login/page.tsx)                                               | Login page                                           |
| [app/api/files/route.ts](app/api/files/route.ts)                                       | List / upload shared files                           |
| [app/api/files/[id]/download/route.ts](app/api/files/[id]/download/route.ts)           | Download a shared file by ID                         |
| [app/api/files/tree/route.ts](app/api/files/tree/route.ts)                             | Virtual file tree (CRUD + sharing)                   |
| [app/api/files/tree/download/[id]/route.ts](app/api/files/tree/download/[id]/route.ts) | Download a virtual-tree file by ID                   |
| [app/api/dav/[...path]/route.ts](app/api/dav/[...path]/route.ts)                       | WebDAV endpoint                                      |
| [app/api/settings/app-passwords/route.ts](app/api/settings/app-passwords/route.ts)     | App password CRUD                                    |
| [app/api/settings/connection-info/route.ts](app/api/settings/connection-info/route.ts) | SFTP + WebDAV connection details                     |
| [components/file-share-hub.tsx](components/file-share-hub.tsx)                         | Shared-files upload / download UI                    |
| [components/file-manager-console.tsx](components/file-manager-console.tsx)             | Virtual file tree UI                                 |
| [components/dashboard-sidebar.tsx](components/dashboard-sidebar.tsx)                   | Navigation sidebar                                   |
| [lib/auth.ts](lib/auth.ts)                                                             | NextAuth + Cognito config                            |
| [lib/files.ts](lib/files.ts)                                                           | Shared-file CRUD (S3-backed index)                   |
| [lib/virtual-files.ts](lib/virtual-files.ts)                                           | Virtual file system (S3-native)                      |
| [lib/app-passwords.ts](lib/app-passwords.ts)                                           | App password management (S3-backed)                  |
| [lib/webdav-locks.ts](lib/webdav-locks.ts)                                             | WebDAV distributed locks (S3-backed)                 |
| [lib/query-provider.tsx](lib/query-provider.tsx)                                       | TanStack Query client provider                       |
| [lib/mock-data.ts](lib/mock-data.ts)                                                   | Mock data for local development                      |
| [lib/observability.ts](lib/observability.ts)                                           | Metrics + tracing abstractions                       |
| [lib/anomaly-detection.ts](lib/anomaly-detection.ts)                                   | Anomaly detection engine                             |
| [lib/reconciliation.ts](lib/reconciliation.ts)                                         | Data reconciliation engine                           |
| [lib/ingestion-validation.ts](lib/ingestion-validation.ts)                             | Ingestion validation rules engine                    |
| [Dockerfile.lambda](Dockerfile.lambda)                                                 | Lambda container image                               |
| [terraform/main.tf](terraform/main.tf)                                                 | All AWS infrastructure                               |
| [.github/workflows/deploy.yml](.github/workflows/deploy.yml)                           | Full CI/CD deploy pipeline                           |
| [.github/workflows/ci.yml](.github/workflows/ci.yml)                                   | PR-only CI gate                                      |
