"""
Cognito Post-Confirmation Lambda – S3 Folder Auto-Provisioner

Triggered automatically after a user confirms their Cognito account
(both admin-confirmed and self-confirmed flows).

Flow:
    1. Extract company IDs from custom:company_id.
    2. For each company, ensure canonical folder prefixes exist in S3 by writing
         a 0-byte placeholder (.keep) at each path when missing.
  3. Always return the Cognito event unchanged so the sign-up flow continues.

S3 paths provisioned:
    s3://{bucket}/{company_id}/to_navara/.keep
    s3://{bucket}/{company_id}/from_navara/.keep
"""

import os
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["S3_BUCKET"]

# Subdirectory names that must exist for every company.
REQUIRED_SUBDIRS = ["to_navara", "from_navara"]


def _normalize_company_id(raw: str) -> str:
    return "-".join(
        filter(
            None,
            "".join(
                ch.lower() if (ch.isalnum() or ch in "_-") else "-"
                for ch in (raw or "").strip()
            ).split("-")
        )
    )[:64]


def _ensure_placeholder(company_id: str, subdir: str) -> None:
    """Write a 0-byte .keep object at company_id/subdir/.keep if absent."""
    key = f"{company_id}/{subdir}/.keep"
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        print(f"[post-confirmation] exists   s3://{BUCKET}/{key}")
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("404", "NoSuchKey"):
            s3.put_object(Bucket=BUCKET, Key=key, Body=b"", ContentType="application/octet-stream")
            print(f"[post-confirmation] created  s3://{BUCKET}/{key}")
        else:
            # Unexpected error (permissions, network, etc.) – surface it so
            # CloudWatch alarms can catch it.  Do NOT silently swallow it.
            print(f"[post-confirmation] ERROR checking {key}: {exc}")
            raise


def handler(event, context):
    user_attrs = {
        attr["Name"]: attr["Value"]
        for attr in event.get("request", {}).get("userAttributes", [])
    }

    raw_company_id = user_attrs.get("custom:company_id", "").strip()
    username = event.get("userName", "unknown")

    company_ids = []
    normalized = _normalize_company_id(raw_company_id)
    if normalized:
        company_ids.append(normalized)

    if not company_ids:
        print(
            f"[post-confirmation] user={username} has no company assignment"
            " – skipping folder provision (user may be Super_Admin or misconfigured)"
        )
        # Returning the event unchanged is REQUIRED by Cognito; never raise here.
        return event

    for company_id in company_ids:
        print(f"[post-confirmation] provisioning folders for company={company_id} user={username}")

        for subdir in REQUIRED_SUBDIRS:
            _ensure_placeholder(company_id, subdir)

        print(f"[post-confirmation] done for company={company_id}")
    return event
