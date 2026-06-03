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

## Managing SFTP Users

AWS Transfer Family is the **primary** interface. Clients upload files via SFTP; the web app is a secondary view for clients to see shared files and for you (super admin) to share files with them.

### How SFTP maps to the web app

Each SFTP user is chrooted to their home directory in S3:

```
s3://{bucket}/clients/{sftp-username}/
```

Files placed here (by the client via SFTP, or by you from the admin side) appear in the web app under that user's file tree once a share grant exists.

### Adding a new client

**Step 1 — Client generates an SSH key pair** (they keep the private key, you get the public key):

```bash
ssh-keygen -t ed25519 -C "client-name" -f ~/.ssh/navara_client
# They send you: ~/.ssh/navara_client.pub
```

**Step 2 — Add to `terraform/terraform.tfvars`:**

```hcl
transfer_users = {
  "existing-client" = "ssh-ed25519 AAAA..."
  "new-client-name" = "ssh-ed25519 AAAA... (paste their public key here)"
}
```

Username rules: alphanumeric + hyphens, 3–100 characters, no `@` or spaces.

**Step 3 — Commit and push to `main`:**

```bash
git add terraform/terraform.tfvars
git commit -m "Add SFTP user: new-client-name"
git push
```

The pipeline applies Terraform, creating the Transfer Family user and SSH key automatically.

**Step 4 — Send the client their connection details:**

```
Host:           (from: terraform output sftp_endpoint)
Port:           22
Username:       new-client-name
Auth:           SSH private key (~/.ssh/navara_client)
Upload path:    / (their root is already scoped to their folder)
```

Alternatively, direct them to the web portal Settings page for the host and WebDAV details.

### Rotating a client's SSH key

**Step 1 — Client generates a new key pair and sends new public key.**

**Step 2 — Update `terraform/terraform.tfvars`** with the new public key value for that username.

**Step 3 — Commit and push.** Terraform destroys the old SSH key resource and creates a new one. The user account itself is unchanged.

> Note: There is a brief window during apply where the old key is removed and the new key is not yet added. Schedule during low-traffic hours if needed.

### Removing a client

**Step 1 — Remove their entry from `terraform/terraform.tfvars`.**

**Step 2 — Commit and push.** Terraform deletes the Transfer Family user and their SSH key.

> Their files remain in S3 at `s3://{bucket}/clients/{username}/`. Delete them manually if required:
>
> ```bash
> aws s3 rm s3://{bucket}/clients/{username}/ --recursive --profile joey-navara
> ```

### Checking active users

```bash
# List all provisioned SFTP users
terraform -chdir=terraform output sftp_usernames

# Or via AWS CLI
aws transfer list-users \
  --server-id $(terraform -chdir=terraform output -raw sftp_endpoint | cut -d. -f1) \
  --region us-east-1 --profile joey-navara
```

### Viewing a client's files (admin)

All client uploads land in S3. You can browse or download them directly:

```bash
# List a client's uploaded files
aws s3 ls s3://{bucket}/clients/{username}/ --profile joey-navara

# Copy a file out
aws s3 cp s3://{bucket}/clients/{username}/report.pdf ./report.pdf --profile joey-navara
```

You can also share files with clients through the web portal (admin dashboard → uploads tab).

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
