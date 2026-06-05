# navara-strategy

Secure multi-tenant file sharing portal and data ingestion platform built with Next.js, deployed to AWS Lambda (container image) behind CloudFront. **Primary application state is stored in S3.** Excel file ingestion is persisted to a PostgreSQL (RDS) database.

## Architecture

```mermaid
flowchart LR
    U[User Browser] --> CF[CloudFront]
    CF --> LFU[Lambda Function URL]
    LFU --> APP[Next.js App on Lambda]

    APP --> COG[Cognito via NextAuth]
    APP --> S3[(S3 Bucket)]
    APP --> TF[AWS Transfer Family SFTP]
    APP --> RDS[(PostgreSQL RDS)]

    subgraph S3 Layout
      S3 --> UF[uploads/user-files/{email}/...]
      S3 --> AP[uploads/.metadata/app-passwords/{email}.json]
      S3 --> SH[uploads/.metadata/shares/{email}.json]
      S3 --> LK[uploads/.metadata/locks/{token}.json]
      S3 --> IX[uploads/.metadata/shared-files-index.json]
      S3 --> EX[excel-imports/{jobId}/{filename}]
    end
```

Production URL: <https://d2i0sz4mcgor37.cloudfront.net>

### Storage Model

Primary mutable state lives in a single S3 bucket. A PostgreSQL RDS instance stores parsed Excel ingestion data and job tracking.

| S3 key pattern                                         | Content                                              |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `{prefix}/user-files/{email}/path/to/file`             | User file content                                    |
| `{prefix}/user-files/{email}/folder/`                  | Folder marker (zero-byte, `application/x-directory`) |
| `{prefix}/.metadata/app-passwords/{email}.json`        | App password records for WebDAV Basic Auth           |
| `{prefix}/.metadata/shares/{email}.json`               | Share grants for a grantee                           |
| `{prefix}/.metadata/locks/{token}.json`                | Active WebDAV lock                                   |
| `{prefix}/.metadata/shared-files-index.json`           | Admin shared-files index                             |
| `{prefix}/.metadata/company-access/{email}.json`       | Per-user multi-company access grants                 |
| `excel-imports/{jobId}/{filename}`                      | Uploaded Excel files staged for Lambda parsing       |

`{prefix}` is controlled by the `FILES_BUCKET_PREFIX` environment variable (default: `uploads`).

In local development (no `FILES_BUCKET` env var), each of these falls back to a parallel path under `uploads/` on the local filesystem.

### PostgreSQL Database

A PostgreSQL 16 RDS instance (managed by Terraform in `terraform/rds.tf`) stores:

- **Excel ingestion jobs** — job ID, status (`pending` → `processing` → `completed` / `failed`), filename, created-by email, timestamps.
- **Parsed sheet data** — row data extracted from `.xlsx`/`.xls` files by the `excel-parser` Lambda.

The schema is auto-created on first use via `lib/excel-upload.ts` (`ensureSchema()`). No manual migrations are needed.

### Runtime Components

- **UI routes**: [app](app). Authenticated dashboard at [app/(dashboard)](<app/(dashboard)>); unauthenticated share hub at [app/upload](app/upload).
- **Auth**: NextAuth v5 backed by Cognito in production; dev credentials used locally. Config: [lib/auth.ts](lib/auth.ts).
- **File APIs**: REST endpoints under `app/api/files/` (shared files + virtual tree), WebDAV at `app/api/dav/`, and settings at `app/api/settings/`.
- **Excel ingestion**: Upload `.xlsx`/`.xls` files via `app/api/excel-upload/presign` (returns a presigned S3 URL + job ID), then poll `app/api/excel-upload/status/[jobId]` for processing status. The `excel-parser` Lambda reads from S3 and writes rows to PostgreSQL.
- **Data quality**: [lib/anomaly-detection.ts](lib/anomaly-detection.ts), [lib/reconciliation.ts](lib/reconciliation.ts), and [lib/ingestion-validation.ts](lib/ingestion-validation.ts) provide server-side anomaly detection, reconciliation, and validation rules for ingested data.

See [Project Paths](#project-paths) for the full file breakdown.

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

## Multi-Tenant SFTP Architecture

### Overview

Every company gets a private, isolated folder in a single shared S3 bucket. Users authenticate with a Cognito email/password — the same credential works for the web portal **and** SFTP. No SSH keys, no per-tenant AWS accounts, no separate Transfer Family users.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          End User                                    │
│  Windows / macOS  ──  File Explorer / Finder (WebDAV or SFTP)       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ SFTP :22  (or WebDAV HTTPS)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              AWS Transfer Family (SFTP, PUBLIC endpoint)             │
│                     Custom Identity Provider                         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Lambda:InvokeFunction
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│          SFTP Auth Lambda  (terraform/sftp-auth/index.mjs)           │
│                                                                      │
│  1. AdminInitiateAuth   ──► Cognito User Pool                        │
│  2. AdminGetUser        ──► read custom:company_id                   │
│  3. AdminListGroups     ──► check Super_Admin membership             │
│  4. Read S3 metadata    ──► .metadata/company-access/<email>.json    │
│                                                                      │
│  Super_Admin → HomeDirectoryType: PATH  → s3://bucket/              │
│  Company user → HomeDirectoryType: LOGICAL with one or many entries │
│               /<company> → s3://bucket/<company>/                    │
│               + session policy restricting to granted prefixes only   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ IAM AssumeRole + session policy
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    S3 Bucket  (single shared)                        │
│                                                                      │
│   {company_a}/to_navara/        {company_b}/to_navara/               │
│   {company_a}/from_navara/      {company_b}/from_navara/             │
│                                                                      │
│  Company_A users see ONLY Company_A/ (logical chroot).              │
│  Super_Admin users see the entire bucket root.                       │
└──────────────────────────────────────────────────────────────────────┘
```

### S3 Folder Structure

| Path                             | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `{company_id}/to_navara/`        | Client uploads files **to** Navara here                   |
| `{company_id}/from_navara/`      | Navara places files **for** the client here               |
| `{company_id}/to_navara/.keep`   | 0-byte placeholder — created automatically on first setup |
| `{company_id}/from_navara/.keep` | 0-byte placeholder — created automatically on first setup |

### Access Control Matrix

| Principal    | Cognito Group     | IAM Role                         | Visible Scope                         |
| ------------ | ----------------- | -------------------------------- | ------------------------------------- |
| Company user | _(none required)_ | `transfer-user` + session policy | One or more `{company_id}/*` prefixes |
| Super Admin  | `Super_Admin`     | `transfer-super-admin`           | Entire bucket (`/*`)                  |

The session policy applied to company users at login time is the second layer of defence: even if the IAM role were accidentally broadened, the session policy limits every action to explicitly granted company prefixes.

### S3 Folder Auto-Provisioning

Because S3 is a flat key-value store, folders don't exist until an object is written. A **Cognito Post-Confirmation Lambda** (`terraform/post-confirmation/index.py`) fires automatically whenever a new user completes account confirmation. It:

1. Reads `custom:company_id` from the confirmed user's Cognito attributes.
2. Calls `s3:HeadObject` on `{company_id}/to_navara/.keep` and `{company_id}/from_navara/.keep`.
3. Writes a 0-byte `.keep` object to any path that doesn't yet exist.

This means the first user onboarded for a new company triggers folder creation automatically — Navara admins never have to pre-create folders manually.

### Company Access Metadata

Web portal and SFTP multi-company access is controlled by:

- `s3://<bucket>/<FILES_BUCKET_PREFIX>/.metadata/company-access/<urlencoded-email>.json`
- Shape: `{ "grants": [{ "companyId": "acme-corp", "canWrite": true }] }`

Super admins can manage these mappings from **Settings → Company Access Management**.

### Migration / Reset Runbook

Use this when moving from legacy `user-files/` layout to company-root layout.

1. Deploy application + Terraform changes first.
2. Create required companies in Settings (or API) so roots and `.keep` files exist.
3. Grant users company access (single or multi-company).
4. Optional clean reset (destructive):

```bash
BUCKET=$(terraform -chdir=terraform output -raw sftp_bucket)
PREFIX=uploads
aws s3 rm s3://$BUCKET/$PREFIX/user-files/ --recursive --profile $PROFILE
```

Only run the reset after confirming all required company data is migrated or intentionally discarded.

---

## User Management Guide

### Prerequisites

```bash
# Retrieve the Cognito User Pool ID from Terraform outputs
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)
REGION=us-east-1
PROFILE=joey-navara   # adjust to your AWS CLI profile
```

---

### Creating a New User — AWS Console

1. Open **AWS Console → Cognito → User Pools → `navara-sftp-users` → Users → Create user**.
2. Set **Invitation message** to _Send an email invitation_ (or suppress it — your choice).
3. Enter the user's **email address** as both the username and email attribute.
4. Tick **Mark email as verified**.
5. Set an initial temporary password.
6. Add the custom attribute `custom:company_id` with the company's ID string (e.g. `acme-corp`). _(See note below on first-time attribute setup.)_
7. Click **Create user**.

> **First-time custom attribute setup**: If `custom:company_id` does not yet appear in the pool schema, add it once via CLI:
>
> ```bash
> aws cognito-idp add-custom-attributes \
>   --user-pool-id $POOL_ID \
>   --custom-attributes Name=company_id,AttributeDataType=String,Mutable=true \
>   --region $REGION --profile $PROFILE
> ```

---

### Creating a New User — AWS CLI

```bash
POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --temporary-password "TempPass123!" \
  --user-attributes \
    Name=email,Value=user@example.com \
    Name=email_verified,Value=true \
    Name=custom:company_id,Value=acme-corp \
  --message-action SUPPRESS \
  --region $REGION \
  --profile $PROFILE
```

`--message-action SUPPRESS` skips the Cognito welcome email — send credentials out-of-band via your preferred secure channel.

> ⚠️ **Important**: The user must complete their first login through the **web portal** to set a permanent password before SFTP will work. If they attempt SFTP with the temporary password, the auth Lambda will deny them (Cognito issues a `NEW_PASSWORD_REQUIRED` challenge that cannot be satisfied over SFTP).

---

### Assigning a User to a Company

If a user was created without a `company_id`, or needs to be moved to a different company:

```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --user-attributes Name=custom:company_id,Value=acme-corp \
  --region $REGION --profile $PROFILE
```

The change takes effect on the user's **next SFTP session** (each session re-fetches attributes from Cognito).

---

### Assigning a User to the Super_Admin Group

Super admins bypass company-level restrictions and see the entire S3 bucket.

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID \
  --username admin@navara.com \
  --group-name Super_Admin \
  --region $REGION --profile $PROFILE
```

To **remove** Super_Admin privileges:

```bash
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id $POOL_ID \
  --username admin@navara.com \
  --group-name Super_Admin \
  --region $REGION --profile $PROFILE
```

> **Note**: `custom:company_id` is not required for Super_Admin users. The auth Lambda checks group membership first; if the user is in `Super_Admin`, `company_id` is ignored.

---

### Resetting a User Password

```bash
# Force the user to set a new password on next web portal login:
aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --password "NewTemp789!" \
  --no-permanent \
  --region $REGION --profile $PROFILE

# Set a permanent password directly (no change required on next login):
aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --password "PermanentP@ss1" \
  --permanent \
  --region $REGION --profile $PROFILE
```

---

### Removing a User

```bash
aws cognito-idp admin-delete-user \
  --user-pool-id $POOL_ID \
  --username user@example.com \
  --region $REGION --profile $PROFILE
```

Deleting the Cognito user immediately revokes both web portal and SFTP access. No SSH keys or Transfer Family users need to be cleaned up separately.

> **S3 files are NOT deleted automatically.** To remove a company's data:
>
> ```bash
> BUCKET=$(terraform -chdir=terraform output -raw sftp_bucket)
> aws s3 rm s3://$BUCKET/acme-corp/ --recursive --profile $PROFILE
> ```

---

### Listing All Users

```bash
# All users in the pool
aws cognito-idp list-users \
  --user-pool-id $POOL_ID \
  --region $REGION --profile $PROFILE

# Filter to a specific company
aws cognito-idp list-users \
  --user-pool-id $POOL_ID \
  --filter 'custom:company_id = "acme-corp"' \
  --region $REGION --profile $PROFILE

# List only Super_Admin members
aws cognito-idp list-users-in-group \
  --user-pool-id $POOL_ID \
  --group-name Super_Admin \
  --region $REGION --profile $PROFILE
```

---

## Company Management Guide

### Onboarding a New Company — End-to-End Flow

```
Admin creates the first user for the company
         │  (sets custom:company_id = "new-company")
         ▼
Cognito sends account confirmation email to the user
         │
         ▼
User clicks the confirmation link
         │
         ▼
Cognito fires Post-Confirmation trigger
         │
         ▼
post-confirmation Lambda reads custom:company_id
         │
         ▼
Lambda writes 0-byte .keep objects:
  s3://bucket/new-company/To_Navara/.keep
  s3://bucket/new-company/From_Navara/.keep
         │
         ▼
User sets permanent password via web portal
         │
         ▼
User connects via SFTP or WebDAV — home directory is ready
```

No manual S3 folder creation is ever required. The pipeline is fully automated.

---

### Choosing a Company ID

The `company_id` value becomes an S3 key prefix. Follow these rules:

| Rule                                             | Reason                                                   |
| ------------------------------------------------ | -------------------------------------------------------- |
| Use lowercase letters, numbers, and hyphens only | S3 keys are case-sensitive; consistency avoids confusion |
| No spaces or special characters                  | Prevents encoding issues in SFTP paths                   |
| Keep it short and stable                         | Renaming later requires migrating all S3 objects         |

**Good examples**: `acme-corp`, `globex`, `initech-uk`

**Bad examples**: `Acme Corp`, `client@example.com`, `company_1/subfolder`

---

### Manually Provisioning Folders (if Auto-Provisioning Missed)

If a user was created before the Post-Confirmation trigger was attached (or if the Lambda failed), provision folders manually:

**Option A — AWS CLI**

```bash
BUCKET=$(terraform -chdir=terraform output -raw sftp_bucket)
COMPANY=acme-corp

# Write the .keep placeholders
aws s3api put-object --bucket $BUCKET --key "$COMPANY/To_Navara/.keep" --body /dev/null --profile $PROFILE
aws s3api put-object --bucket $BUCKET --key "$COMPANY/From_Navara/.keep" --body /dev/null --profile $PROFILE

# Verify
aws s3 ls s3://$BUCKET/$COMPANY/ --recursive --profile $PROFILE
```

**Option B — Manually invoke the Post-Confirmation Lambda**

```bash
aws lambda invoke \
  --function-name navara-sftp-post-confirmation \
  --payload '{
    "userName": "user@acme.com",
    "request": {
      "userAttributes": [
        {"Name": "custom:company_id", "Value": "acme-corp"}
      ]
    }
  }' \
  --cli-binary-format raw-in-base64-out \
  /tmp/response.json \
  --region $REGION --profile $PROFILE

cat /tmp/response.json
```

---

### Verifying a Company's S3 Folders

```bash
BUCKET=$(terraform -chdir=terraform output -raw sftp_bucket)

# List all objects for a company
aws s3 ls s3://$BUCKET/acme-corp/ --recursive --profile $PROFILE

# Download a file placed in From_Navara for the client
aws s3 cp "s3://$BUCKET/acme-corp/From_Navara/report.pdf" ./report.pdf --profile $PROFILE

# Upload a file to From_Navara for the client
aws s3 cp ./invoice.pdf "s3://$BUCKET/acme-corp/From_Navara/invoice.pdf" --profile $PROFILE
```

---

### Adding Additional Users to an Existing Company

Simply create new Cognito users with the **same `custom:company_id`** value. They will land in the already-provisioned company folder. The Post-Confirmation Lambda is a no-op when the `.keep` files already exist.

```bash
# Second user at acme-corp — no new S3 folder needed, Lambda is idempotent
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username another@acme.com \
  --temporary-password "TempPass123!" \
  --user-attributes \
    Name=email,Value=another@acme.com \
    Name=email_verified,Value=true \
    Name=custom:company_id,Value=acme-corp \
  --message-action SUPPRESS \
  --region $REGION --profile $PROFILE
```

---

## Client Connection Guide

Users connect with a **single set of credentials** for all access methods:

| Field    | Value                                                  |
| -------- | ------------------------------------------------------ |
| Username | Their Cognito email address                            |
| Password | Their Cognito password (set on first web portal login) |

> ⚠️ **Mandatory first step**: The user **must** log into the web portal at least once to set a permanent password before SFTP or drive mounting will work. Temporary passwords are rejected by the SFTP auth Lambda.

---

### Connection Details

```bash
# Retrieve live endpoint values from Terraform
terraform -chdir=terraform output sftp_endpoint       # SFTP hostname
terraform -chdir=terraform output webdav_endpoint     # WebDAV URL
terraform -chdir=terraform output app_url             # Web portal URL
```

| Method     | Address                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Web portal | `https://<cloudfront-domain>`                                           |
| WebDAV     | `https://<cloudfront-domain>/api/dav`                                   |
| SFTP       | `<transfer-server-id>.server.transfer.<region>.amazonaws.com` port `22` |

---

### Option A — WebDAV (Recommended for most users)

WebDAV is built into both Windows and macOS. No extra software is required. Users see their company folder (`To_Navara/` and `From_Navara/`) directly in File Explorer or Finder.

**Limitation**: WebDAV operates through the web portal; the user sees their personal files area, not the raw `To_Navara/From_Navara` hierarchy. If you need the exact SFTP folder structure in the drive mount, use Option B instead.

#### Windows — Map Network Drive (WebDAV)

1. Open **File Explorer → This PC → Computer (ribbon) → Map Network Drive**.
2. Choose an unused drive letter (e.g. `Z:`).
3. In the **Folder** field, enter:
   ```
   https://<cloudfront-domain>/api/dav
   ```
4. Tick **Reconnect at sign-in** and **Connect using different credentials**.
5. Click **Finish**. When prompted, enter:
   - **Username**: their email address
   - **Password**: their Cognito permanent password
6. The drive appears in File Explorer as `Z: (dav)`.

**Command-line equivalent (run as Administrator):**

```cmd
net use Z: "https://<cloudfront-domain>/api/dav" /user:user@acme.com "TheirPassword" /persistent:yes
```

#### macOS — Mount in Finder (WebDAV)

1. In Finder, press **⌘K** (or **Go → Connect to Server…**).
2. Enter the server address:
   ```
   https://<cloudfront-domain>/api/dav
   ```
3. Click **Connect**.
4. Select **Registered User**, enter email and Cognito password, click **Connect**.
5. The drive mounts on the Desktop and in Finder's sidebar under **Locations**.

---

### Option B — SFTP Drive Mount (Direct S3 Folder Access)

SFTP mounting exposes the exact `To_Navara/` and `From_Navara/` folder structure. This is the recommended method when users need to see the canonical company folder hierarchy.

#### Windows — SSHFS-Win (Free)

SSHFS-Win maps SFTP as a Windows network drive with no monthly fee.

**Installation (one-time, run as Administrator):**

```powershell
# Install WinFsp (the FUSE driver)
winget install WinFsp.WinFsp

# Install SSHFS-Win
winget install SSHFS-Win.SSHFS-Win
```

**Mounting:**

```cmd
net use X: \\sshfs\user@acme.com@<sftp-endpoint>!22 /user:user@acme.com "TheirPassword" /persistent:yes
```

Replace:

- `X:` with any available drive letter
- `user@acme.com` with the user's email
- `<sftp-endpoint>` with the Transfer Family hostname (from `terraform output sftp_endpoint`)
- `TheirPassword` with their Cognito permanent password

After connecting, drive `X:` contains `To_Navara/` and `From_Navara/` at the root — the logical chroot means the company folder **is** the root.

**To disconnect:**

```cmd
net use X: /delete
```

#### Windows — RaiDrive (GUI option, freemium)

1. Download and install [RaiDrive](https://www.raidrive.com/).
2. Click **Add** → choose **NAS → SFTP**.
3. Fill in:
   - **Address**: `<sftp-endpoint>`
   - **Port**: `22`
   - **Account**: email address
   - **Password**: Cognito permanent password
4. Click **Connect**. A new drive letter appears in File Explorer.

#### macOS — SFTP via Mountain Duck (Paid, easiest)

[Mountain Duck](https://mountainduck.io/) mounts SFTP as a macOS volume (appears in Finder):

1. Install Mountain Duck.
2. Click **Open Connection** → **SFTP (SSH File Transfer Protocol)**.
3. Enter:
   - **Server**: `<sftp-endpoint>`
   - **Port**: `22`
   - **Username**: email address
   - **Password**: Cognito permanent password
4. Click **Connect**. The company folder mounts in Finder.

#### macOS — SFTP via Cyberduck (Free browser)

Cyberduck doesn't mount as a native volume but provides full file management:

1. Install [Cyberduck](https://cyberduck.io/).
2. Click **Open Connection** → **SFTP**.
3. Enter the same server/username/password as above.
4. Navigate files, drag-and-drop to upload/download.

---

### Troubleshooting

| Symptom                                                      | Likely Cause                                 | Fix                                                                            |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| SFTP auth fails with "permission denied"                     | Temporary password not yet replaced          | User must log into the web portal first to set a permanent password            |
| "Home directory not found" on SFTP login                     | `company_id` folders not provisioned         | Run manual provisioning (see Company Management Guide above)                   |
| WebDAV shows 401 Unauthorized                                | Wrong credentials or app password expired    | Verify email/password or regenerate an app password in the web portal Settings |
| SFTP connects but shows empty directory                      | `custom:company_id` not set on the user      | Set the attribute via CLI: `admin-update-user-attributes`                      |
| Cannot write files (SFTP)                                    | User not yet confirmed in Cognito            | Check user status in Cognito console; confirm if needed                        |
| Windows "The folder you entered does not appear to be valid" | HTTPS certificate or WebClient service issue | Ensure the WebClient Windows service is running: `Start-Service WebClient`     |

---

## Project Paths

| Path                                                                                         | Purpose                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [app](app)                                                                                   | All Next.js routes                                   |
| [app/(dashboard)/files/page.tsx](<app/(dashboard)/files/page.tsx>)                           | Dashboard — virtual file tree UI                     |
| [app/(dashboard)/uploads/page.tsx](<app/(dashboard)/uploads/page.tsx>)                       | Dashboard — shared-file upload / inbox UI            |
| [app/(dashboard)/settings/page.tsx](<app/(dashboard)/settings/page.tsx>)                     | Settings — app passwords, connection info, company access |
| [app/upload/page.tsx](app/upload/page.tsx)                                                   | Standalone file-share hub (outside dashboard layout) |
| [app/login/page.tsx](app/login/page.tsx)                                                     | Login page                                           |
| [app/api/files/route.ts](app/api/files/route.ts)                                             | List / upload shared files                           |
| [app/api/files/[id]/download/route.ts](app/api/files/[id]/download/route.ts)                 | Download a shared file by ID                         |
| [app/api/files/tree/route.ts](app/api/files/tree/route.ts)                                   | Virtual file tree (CRUD + sharing)                   |
| [app/api/files/tree/download/[id]/route.ts](app/api/files/tree/download/[id]/route.ts)       | Download a virtual-tree file by ID                   |
| [app/api/dav/[...path]/route.ts](app/api/dav/[...path]/route.ts)                             | WebDAV endpoint                                      |
| [app/api/settings/app-passwords/route.ts](app/api/settings/app-passwords/route.ts)           | App password CRUD                                    |
| [app/api/settings/connection-info/route.ts](app/api/settings/connection-info/route.ts)       | SFTP + WebDAV connection details                     |
| [app/api/settings/company-access/route.ts](app/api/settings/company-access/route.ts)         | Company access grants — create company, set/list user access |
| [app/api/settings/company-access/users/route.ts](app/api/settings/company-access/users/route.ts) | List all users for company access management     |
| [app/api/settings/database/verify/route.ts](app/api/settings/database/verify/route.ts)       | Super-admin: verify PostgreSQL connectivity          |
| [app/api/excel-upload/presign/route.ts](app/api/excel-upload/presign/route.ts)               | Create Excel upload job + return presigned S3 URL    |
| [app/api/excel-upload/status/[jobId]/route.ts](app/api/excel-upload/status/[jobId]/route.ts) | Poll Excel ingestion job status                      |
| [components/file-share-hub.tsx](components/file-share-hub.tsx)                               | Shared-files upload / download UI                    |
| [components/file-manager-console.tsx](components/file-manager-console.tsx)                   | Virtual file tree UI                                 |
| [components/dashboard-sidebar.tsx](components/dashboard-sidebar.tsx)                         | Navigation sidebar                                   |
| [lib/auth.ts](lib/auth.ts)                                                                   | NextAuth + Cognito config                            |
| [lib/files.ts](lib/files.ts)                                                                 | Shared-file CRUD (S3-backed index)                   |
| [lib/virtual-files.ts](lib/virtual-files.ts)                                                 | Virtual file system (S3-native)                      |
| [lib/company-access.ts](lib/company-access.ts)                                               | Multi-company access grants (S3-backed)              |
| [lib/app-passwords.ts](lib/app-passwords.ts)                                                 | App password management (S3-backed)                  |
| [lib/webdav-locks.ts](lib/webdav-locks.ts)                                                   | WebDAV distributed locks (S3-backed)                 |
| [lib/excel-upload.ts](lib/excel-upload.ts)                                                   | Excel ingestion job management (PostgreSQL-backed)   |
| [lib/anomaly-detection.ts](lib/anomaly-detection.ts)                                         | Data quality anomaly detection engine                |
| [lib/reconciliation.ts](lib/reconciliation.ts)                                               | Data reconciliation engine                           |
| [lib/ingestion-validation.ts](lib/ingestion-validation.ts)                                   | Ingestion validation rules engine                    |
| [lib/query-provider.tsx](lib/query-provider.tsx)                                             | TanStack Query client provider                       |
| [lib/mock-data.ts](lib/mock-data.ts)                                                         | Mock data for local development                      |
| [lib/observability.ts](lib/observability.ts)                                                 | Metrics + tracing abstractions                       |
| [Dockerfile.lambda](Dockerfile.lambda)                                                       | Lambda container image                               |
| [terraform/main.tf](terraform/main.tf)                                                       | AWS infrastructure (Lambda, Cognito, CloudFront, S3, Transfer, IAM) |
| [terraform/rds.tf](terraform/rds.tf)                                                         | PostgreSQL 16 RDS configuration                      |
| [terraform/sftp-auth/index.mjs](terraform/sftp-auth/index.mjs)                               | SFTP custom auth Lambda (Node.js)                    |
| [terraform/post-confirmation/index.py](terraform/post-confirmation/index.py)                 | S3 folder auto-provisioner Lambda (Python)           |
| [terraform/excel-parser/index.mjs](terraform/excel-parser/index.mjs)                         | Excel file parsing Lambda (Node.js → PostgreSQL)     |
| [.github/workflows/deploy.yml](.github/workflows/deploy.yml)                                 | Full CI/CD deploy pipeline                           |
| [.github/workflows/ci.yml](.github/workflows/ci.yml)                                         | PR-only CI gate                                      |
