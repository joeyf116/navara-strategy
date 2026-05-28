terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment and configure to enable remote state management.
  # The S3 bucket and DynamoDB table can be bootstrapped with:
  #   aws s3api create-bucket --bucket <your-tf-state-bucket> --region us-east-1
  #   aws dynamodb create-table --table-name <your-tf-lock-table> \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST
  #
  # backend "s3" {
  #   bucket         = "<project-name>-terraform-state"
  #   key            = "<project-name>/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "<project-name>-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = var.project_name
    }
  }
}
