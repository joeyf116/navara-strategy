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

SFTP access and web portal access are **provisioned separately** and linked only by the files in S3:

- **SFTP** uses an SSH key — managed via Terraform tfvars or the AWS Console
- **Web portal** uses a Cognito username + password — managed via the AWS CLI or Console

### Adding a new client (full onboarding)

This provisions both SFTP access and web portal access for a client.

---

#### Step 1 — Generate an SSH key pair for the client

You generate the key pair and send the client both files, **or** the client generates it and sends you only the `.pub` file (more secure — they never share the private key).

To generate on the client's behalf:

```bash
ssh-keygen -t ed25519 -C "client-name" -f client-name_ed25519
# client-name_ed25519      ← private key (send to client securely)
# client-name_ed25519.pub  ← public key  (you keep this)
```

---

#### Step 2 — Provision the SFTP user

**Option A — Terraform (recommended, tracked in git):**

Add an entry to `terraform/terraform.tfvars`:

```hcl
transfer_users = {
  "existing-client" = "ssh-ed25519 AAAA..."
  "new-client-name" = "ssh-ed25519 AAAA... (paste their public key here)"
}
```

Username rules: alphanumeric + hyphens, 3–100 characters, no `@` or spaces.

```bash
git add terraform/terraform.tfvars
git commit -m "Add SFTP user: new-client-name"
git push
```

The pipeline applies Terraform, creating the Transfer Family user and SSH key automatically.

**Option B — AWS Console (fast, no git commit required):**

1. Open [AWS Transfer Family](https://console.aws.amazon.com/transfer/) → select your server → **Users** tab → **Add user**
2. Set **Username** (match whatever you'll put in tfvars later)
3. **Access** → select the `navara-sftp-transfer-user` IAM role
4. **Home directory** → Restricted → bucket `navara-sftp-911788523695`, folder `clients/new-client-name`
5. Paste the client's public key under **SSH public keys**
6. Save

> **Important:** Users created in the Console are invisible to Terraform. To prevent the next `terraform apply` from deleting them, add the same entry to `terraform.tfvars` and push. Until then, avoid running `terraform apply` or use `-target` flags that exclude the Transfer Family user resources.

---

#### Step 3 — Create the client's web portal account (Cognito)

The web app authenticates via Cognito. Create a user account so the client can log in:

```bash
# Get your pool ID first
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

# Replace: client@example.com with the client's email
# Replace: TempPass123! with a strong temporary password you choose

aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --temporary-password "TempPass123!" \
  --user-attributes Name=email,Value=client@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1 \
  --profile joey-navara
```

`--message-action SUPPRESS` skips the Cognito welcome email so you control how credentials are delivered.

Then add the user to the `tenant_user` group (gives them client-level access in the app):

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --group-name tenant_user \
  --region us-east-1 \
  --profile joey-navara
```

> You can also do both steps in **AWS Console → Cognito → User Pools → your pool → Users → Create user**.

---

#### Step 4 — Send the client their credentials

Send via email or a secure channel:

```
=== SFTP Access ===
Host:      (from: terraform output sftp_endpoint)
Port:      22
Username:  new-client-name
Auth:      SSH private key (attached)

=== Web Portal ===
URL:       https://d2i0sz4mcgor37.cloudfront.net
Email:     client@example.com
Password:  TempPass123!  ← you will be prompted to set a new password on first login
```

The client logs in at the web portal URL, enters their email and temporary password, and Cognito immediately prompts them to set a permanent password.

---

### Rotating a client's SSH key

1. Generate a new key pair (or have the client generate one)
2. **Terraform:** update the value in `terraform.tfvars` and push
3. **Console:** go to Transfer Family → server → user → **SSH public keys** → delete old, add new

> There is a brief window during Terraform apply where the old key is removed before the new one is added. Schedule during low-traffic hours if needed.

### Removing a client

**Terraform:**

1. Delete the entry from `terraform/terraform.tfvars` and push
2. Delete the Cognito user:

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-delete-user \
  --user-pool-id $POOL_ID \
  --username client@example.com \
  --region us-east-1 --profile joey-navara
```

**Console:** Transfer Family → server → Users → select user → **Delete**. Then Cognito → User Pools → Users → select user → **Delete user**.

> Their S3 files remain at `s3://{bucket}/clients/{username}/`. Delete them manually if required:
>
> ```bash
> aws s3 rm s3://navara-sftp-911788523695/clients/client-name/ --recursive --profile joey-navara
> ```

### Checking active users

```bash
# SFTP users (Terraform-managed)
terraform -chdir=terraform output sftp_usernames

# All SFTP users including Console-created ones
aws transfer list-users \
  --server-id $(terraform -chdir=terraform output -raw sftp_endpoint | cut -d. -f1 | sed 's/s-//') \
  --region us-east-1 --profile joey-navara

# Cognito / web portal users
aws cognito-idp list-users \
  --user-pool-id $(terraform -chdir=terraform output -raw cognito_user_pool_id) \
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
