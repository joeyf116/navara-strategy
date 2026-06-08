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

- **UI shell:** App Router dashboard at `/files`, `/uploads`, and `/settings`.
- **Files workspace (`/files`):** virtual file tree backed by S3 prefixes with per-company access controls.
- **Import workflow (`/uploads`):** uploads `.xlsx/.xls` directly to S3 using presigned URLs, then tracks ingestion jobs in PostgreSQL.
- **Settings (`/settings`):** WebDAV/SFTP/database connection details, app-password management, and super-admin company/user access tools.
- **Legacy share hub (`/upload`):** authenticated shared-file upload/list screen backed by `/api/files`.

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

In production, roles are derived from Cognito groups. In local/dev mode, a credentials provider with demo users is enabled.

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

- **PRs to `main`:** `.github/workflows/ci.yml` runs lint, type-check (`npx tsc --noEmit`), and build.
- **Pushes to `main`:** `.github/workflows/deploy.yml` runs CI gate, builds/pushes Docker image, then runs Terraform apply.

### Required GitHub secret

- `AWS_DEPLOY_ROLE_ARN`

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
