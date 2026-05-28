# navara-strategy

Minimal Next.js + TypeScript SFTP file-share hub with neutral shadcn-style UI components.

## What this includes

- **Client upload hub** (`/`) with shadcn-style `Card`, `Input`, `Button`, and `Table` components.
- **Upload API** (`POST /api/files`) and **list API** (`GET /api/files`).
- **PostgreSQL support** via `DATABASE_URL` (RDS-ready). Falls back to local file metadata when no DB is configured.
  Local fallback metadata is stored in `uploads/index.json`.
- **Terraform** (`/terraform`) for:
  - AWS App Runner deployment for the Next.js app
  - RDS PostgreSQL
  - AWS Transfer Family (SFTP) + S3-backed user home directory
  - AWS Secrets Manager secret for `DATABASE_URL` (used by App Runner)

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Infrastructure (Terraform)

```bash
cd terraform
terraform init
cp terraform.tfvars.example terraform.tfvars
terraform plan
terraform apply
```

After apply, use outputs for:

- `app_url`
- `database_endpoint`
- `database_url_secret_arn`
- `sftp_endpoint`
