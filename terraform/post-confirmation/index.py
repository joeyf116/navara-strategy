"""
Cognito Post-Confirmation Lambda – S3 Folder Auto-Provisioner

Triggered automatically after a user confirms their Cognito account
(both admin-confirmed and self-confirmed flows).

Flow:
  1. Extract custom:company_id from the confirmed user's attributes.
  2. If company_id is present, ensure the two canonical folder prefixes exist
     in the Transfer Family S3 bucket by writing a 0-byte placeholder (.keep)
     to each path when it is missing.
  3. Always return the Cognito event unchanged so the sign-up flow continues.

S3 paths provisioned:
  s3://{bucket}/{company_id}/To_Navara/.keep
  s3://{bucket}/{company_id}/From_Navara/.keep
"""

import os
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["S3_BUCKET"]

# Subdirectory names that must exist for every company.
REQUIRED_SUBDIRS = ["To_Navara", "From_Navara"]


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

    company_id = user_attrs.get("custom:company_id", "").strip()
    username = event.get("userName", "unknown")

    if not company_id:
        print(
            f"[post-confirmation] user={username} has no custom:company_id"
            " – skipping folder provision (user may be Super_Admin or misconfigured)"
        )
        # Returning the event unchanged is REQUIRED by Cognito; never raise here.
        return event

    print(f"[post-confirmation] provisioning folders for company={company_id} user={username}")

    for subdir in REQUIRED_SUBDIRS:
        _ensure_placeholder(company_id, subdir)

    print(f"[post-confirmation] done for company={company_id}")
    return event
