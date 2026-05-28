# navara-strategy

Minimal Next.js + TypeScript SFTP file-share hub with neutral shadcn-style UI components.

## What this includes

- **Client upload hub** (`/`) with shadcn-style `Card`, `Input`, `Button`, and `Table` components.
- **Upload API** (`POST /api/files`) and **list API** (`GET /api/files`).
- **PostgreSQL support** via `DATABASE_URL` (RDS-ready). Falls back to in-memory storage when no DB is configured.
- **Terraform** (`/terraform`) for:
  - AWS App Runner deployment for the Next.js app
  - RDS PostgreSQL
  - AWS Transfer Family (SFTP) + S3-backed user home directory

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
- `sftp_endpoint`
