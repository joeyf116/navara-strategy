# navara-strategy

Navara Strategy is a Next.js 16 portal for multi-tenant file operations, WebDAV access, and Excel-to-PostgreSQL ingestion.

## Current architecture

```mermaid
flowchart LR
  Browser[User browser] --> Next[Next.js App Router]
  Next --> Auth[NextAuth v5]
  Auth --> Cognito[(AWS Cognito)]

  Next --> FilesAPI[/api/files + /api/files/tree + /api/dav]
  FilesAPI --> S3[(S3 bucket)]

  Next --> ImportAPI[/api/excel-upload/*]
  ImportAPI --> S3
  ImportAPI --> RDS[(PostgreSQL)]

  Next --> SettingsAPI[/api/settings/*]
  SettingsAPI --> S3
  SettingsAPI --> Cognito
  SettingsAPI --> RDS
```

### Runtime model

- **UI shell:** App Router portal with a role-aware dashboard at `/`, plus `/files`, `/uploads`, and `/settings`.
- **Files workspace (`/files`):** virtual file tree backed by S3 prefixes with per-company access controls.
- **Import workflow (`/uploads`):** uploads `.xlsx/.xls` directly to S3 using presigned URLs, then tracks ingestion jobs in PostgreSQL.
- **Settings (`/settings`):** WebDAV/SFTP connection setup, app-password management, and database connection details (super admin).
- **User access (`/users`, super admin only):** Cognito user management and company-level access grants. Server-side route guard; non-admins get an access-denied state.
- **Legacy share hub (`/upload`):** removed — the route now redirects to `/files`. The `/api/files` endpoints remain available.

## Storage and access model

### S3

`FILES_BUCKET_PREFIX` defaults to `uploads`.

- `${prefix}/.metadata/company-access/<email>.json` — company grants
- `${prefix}/.metadata/app-passwords/<email>.json` — WebDAV app passwords
- `${prefix}/.metadata/locks/<token>.json` — WebDAV lock records
- `${prefix}/.metadata/shared-files-index.json` — shared-files metadata index
- `${prefix}/<company-id>/to_navara/*` and `${prefix}/<company-id>/from_navara/*` — tenant file roots
- `excel-imports/<jobId>/<filename>` — staged Excel imports

If `FILES_BUCKET` is not set, file metadata/content falls back to local files under `uploads/` for development.

### PostgreSQL

`lib/excel-upload.ts` creates and uses:

- `import_jobs`
- `imported_records`

Schema bootstraps automatically via `ensureSchema()` when import endpoints are used.

### Auth and RBAC

Roles:

- `super_admin`
- `admin`
- `tenant_user`
- `read_only_auditor`

In production, roles are derived from Cognito groups (see `roleFromCognitoProfile` in `lib/auth.ts`; unmapped users default to `tenant_user`). In local/dev mode, a credentials provider with demo users is enabled — the login page offers one-click sign-in per role.

Permission checks are centralized in `lib/rbac.ts`:

- `rolePermissions` — feature grants per role (`super_admin` has `"*"`)
- `canAccessFeature(role, feature)` — used by the sidebar and dashboard to filter navigation and widgets
- `hasRole` / `hasAnyRole` / `isAdminRole` — direct role checks

UI gating is convenience only; **enforcement happens server-side** in the API route handlers (e.g. `requireSuperAdmin` in `app/api/settings/company-access/*`, role checks in `app/api/files/*`). To add a feature: add its key to the `Feature` union and the relevant roles in `rolePermissions`, gate the UI with `canAccessFeature`, and enforce the same rule in the API route.

The dashboard (`/`) is a role-aware overview containing previews and summaries only — full data lives on its canonical page (files on `/files`, imports on `/uploads`, connection setup on `/settings`, user management on `/users`). All roles see a recent-files preview and their own company-access summary; `super_admin` additionally sees a user/company-access summary linking to `/users`. Admin-only widgets call super-admin-only APIs, which reject other roles regardless of what the client renders.

## API surface (high level)

- `app/api/files/*` — shared file list/upload/download
- `app/api/files/tree/*` — virtual filesystem CRUD/download
- `app/api/dav/[...path]` — WebDAV endpoint (Basic auth via app passwords)
- `app/api/excel-upload/*` — import presign + status polling
- `app/api/settings/*` — connection info, DB verify, app passwords, company access, user admin
- `app/api/auth/*` — NextAuth handlers + logout URL helper

## Local setup

### Prerequisites

- Node.js 22+
- npm

### Install

```bash
npm ci
```

### Environment (`.env.local`)

Minimum local development variables:

```bash
NEXTAUTH_SECRET=replace-with-random-secret
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_DEV_MODE=true
```

Optional/feature variables:

```bash
# Cognito (production-style auth instead of dev credentials)
AUTH_COGNITO_ID=
AUTH_COGNITO_SECRET=
AUTH_COGNITO_ISSUER=
COGNITO_DOMAIN=

# Storage
FILES_BUCKET=
FILES_BUCKET_PREFIX=uploads
MAX_UPLOAD_SIZE_MB=1024

# Excel import / DB tools
DATABASE_URL=

# Settings connection display
SFTP_ENDPOINT=
AUTH_URL=
```

### Run

```bash
npm run dev
```

App URLs:

- `http://localhost:3000/` (role-aware dashboard)
- `http://localhost:3000/files`
- `http://localhost:3000/uploads`
- `http://localhost:3000/settings`

## Validation commands

```bash
npm run lint
npm run build
```

> In restricted/offline environments, `npm run build` may fail when `next/font` cannot fetch Google Fonts (`Geist`).

## CI/CD

**Deployment is manual-only.** Nothing deploys on push, pull request, or merge.

- **PRs and pushes to `main`:** `.github/workflows/ci.yml` runs lint, type-check (`npx tsc --noEmit`), build, `terraform fmt -check`, and `terraform validate`. It uses no AWS credentials and cannot deploy.
- **Deployment:** `.github/workflows/deploy.yml` runs only via **workflow_dispatch**.

### How to deploy

1. GitHub → **Actions** → **Manual Deploy** → **Run workflow**.
2. Choose:
   - **Environment** — `production` (extend the choice list as more environments are added)
   - **Action** — `plan` (preview only, uploads the plan as an artifact, applies nothing) or `apply`
   - **Build & push image** — build the Docker image from the selected ref (default on)
   - **Run Terraform** — plan/apply infrastructure (default on)
3. Review the job summary (deployment selection + tail of the Terraform plan). With `action = plan`, stop here; re-run with `apply` when satisfied.

Combinations worth knowing:

- **Frontend-only release:** image build on, Terraform off, action `apply` — the workflow pushes the image and updates the Lambda directly via `aws lambda update-function-code`.
- **Infra-only change:** image build off, Terraform on — the workflow reuses the currently deployed image URI (read from the Lambda) so Terraform doesn't roll the function.
- **Plan-only dry run:** action `plan` with either toggle.

### Production approval gate (recommended)

Create a GitHub **Environment** named `production` (Settings → Environments) and add **Required reviewers**. The deploy jobs run with `environment: production`, so AWS credentials are only issued after a reviewer approves the run. Store `AWS_DEPLOY_ROLE_ARN` as an environment secret there.

### Required GitHub secret

- `AWS_DEPLOY_ROLE_ARN` (OIDC role; no static AWS keys are used). The role is least-privilege — see `terraform/README.md` ("Deploy role") for its scope and the `tf_state_bucket`/`tf_lock_table` variables that must match `TF_STATE_BUCKET`/`TF_LOCK_TABLE`.

### Required GitHub variables

- `AWS_REGION`
- `ECR_REPOSITORY`
- `TF_STATE_BUCKET`
- `TF_STATE_KEY`
- `TF_LOCK_TABLE`
- `COGNITO_DOMAIN`
- `APP_PUBLIC_URL`
- `COGNITO_CALLBACK_URLS`
- `COGNITO_LOGOUT_URLS`

## Key paths

- `/app/(dashboard)` — authenticated UI routes
- `/app/api` — API routes
- `/components` — UI components and feature consoles
- `/lib` — auth, storage, access control, and domain logic
- `/terraform` — AWS infrastructure and supporting Lambdas
- `/.github/workflows` — CI and deployment pipelines
