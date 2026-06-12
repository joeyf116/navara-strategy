# -----------------------------------------------------------------------------
# GitHub Actions OIDC deploy role
#
# Least-privilege: two inline policies replace the former AdministratorAccess
# attachment. "services" grants the service APIs Terraform manages (scoped to
# project resources where ARNs are predictable); "iam" is restricted to
# project-prefixed roles, the GitHub OIDC provider, and PassRole to the
# services that consume those roles.
#
# Rollback: if a deploy fails with AccessDenied after this change, re-attach
# AdministratorAccess to the role via the console/CLI, fix the missing action
# here, apply, then detach it again.
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  tags = local.tags_cicd
}

resource "aws_iam_role" "github_actions_deploy" {
  name = var.github_actions_deploy_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"
          }
        }
      }
    ]
  })

  tags = local.tags_cicd
}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Buckets the deploy role may manage: the project buckets plus (when set)
  # the Terraform state bucket. Set tf_state_bucket/tf_lock_table or the next
  # CI run cannot read state after AdministratorAccess is detached — the
  # deploy workflow passes them as TF_VAR_* from repository variables.
  deploy_s3_bucket_arns = concat(
    [
      "arn:aws:s3:::${var.project_name}-*",
      "arn:aws:s3:::${var.project_name}-*/*",
    ],
    var.tf_state_bucket != "" ? [
      "arn:aws:s3:::${var.tf_state_bucket}",
      "arn:aws:s3:::${var.tf_state_bucket}/*",
    ] : []
  )

  deploy_lock_table_arn = "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${var.tf_lock_table != "" ? var.tf_lock_table : "*"}"

  deploy_managed_role_arns = [
    "arn:aws:iam::${local.account_id}:role/${var.project_name}-*",
    "arn:aws:iam::${local.account_id}:role/${var.github_actions_deploy_role_name}",
  ]
}

resource "aws_iam_role_policy" "github_actions_deploy_services" {
  name = "${var.project_name}-deploy-services"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Service APIs Terraform manages for this stack. Resource-level
        # scoping is impractical for several of these (CloudFront policies,
        # Cognito pools, Budgets get generated IDs), so they are scoped at
        # the service level — still a fraction of AdministratorAccess.
        Sid    = "ProjectServices"
        Effect = "Allow"
        Action = [
          "ecr:*",
          "lambda:*",
          "cloudfront:*",
          "cognito-idp:*",
          "transfer:*",
          "rds:*",
          "secretsmanager:*",
          "budgets:*",
          "logs:*",
        ]
        Resource = "*"
      },
      {
        Sid      = "ProjectAndStateBuckets"
        Effect   = "Allow"
        Action   = "s3:*"
        Resource = local.deploy_s3_bucket_arns
      },
      {
        Sid      = "S3ListAll"
        Effect   = "Allow"
        Action   = ["s3:ListAllMyBuckets", "s3:GetBucketLocation"]
        Resource = "*"
      },
      {
        Sid      = "TerraformLockTable"
        Effect   = "Allow"
        Action   = "dynamodb:*"
        Resource = local.deploy_lock_table_arn
      },
      {
        # VPC data sources plus the optional NAT/private-subnet path and the
        # S3 gateway endpoint. Deliberately excludes instance APIs.
        Sid    = "Networking"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:CreateSubnet",
          "ec2:DeleteSubnet",
          "ec2:ModifySubnetAttribute",
          "ec2:AllocateAddress",
          "ec2:ReleaseAddress",
          "ec2:CreateNatGateway",
          "ec2:DeleteNatGateway",
          "ec2:CreateRouteTable",
          "ec2:DeleteRouteTable",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:ReplaceRoute",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:CreateVpcEndpoint",
          "ec2:DeleteVpcEndpoints",
          "ec2:ModifyVpcEndpoint",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_deploy_iam" {
  name = "${var.project_name}-deploy-iam"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageProjectRoles"
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:UpdateRoleDescription",
          "iam:UpdateAssumeRolePolicy",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "iam:GetRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
        ]
        Resource = local.deploy_managed_role_arns
      },
      {
        Sid      = "PassProjectRolesToServices"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = local.deploy_managed_role_arns
        Condition = {
          StringEquals = {
            "iam:PassedToService" = [
              "lambda.amazonaws.com",
              "edgelambda.amazonaws.com",
              "transfer.amazonaws.com",
            ]
          }
        }
      },
      {
        Sid    = "ManageGithubOidcProvider"
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
          "iam:AddClientIDToOpenIDConnectProvider",
          "iam:RemoveClientIDFromOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:UntagOpenIDConnectProvider",
        ]
        Resource = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
      },
      {
        # First-use service-linked roles (CloudFront/Lambda@Edge replication,
        # RDS). No-op once they exist.
        Sid      = "ServiceLinkedRoles"
        Effect   = "Allow"
        Action   = "iam:CreateServiceLinkedRole"
        Resource = "arn:aws:iam::${local.account_id}:role/aws-service-role/*"
      },
    ]
  })
}
