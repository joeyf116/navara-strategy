/**
 * AWS Transfer Family custom identity provider.
 *
 * Flow:
 *  1. Authenticate the supplied username (email) + password against Cognito.
 *  2. Fetch the user's custom:company_id attribute and group membership.
 *  3a. Super_Admin group members → full bucket access, home dir = bucket root.
 *  3b. Regular users with a company_id → scoped session policy restricting them
 *      to /<bucket>/<company_id>/ only, home dir = that prefix (logical chroot).
 *  4. No company_id and not Super_Admin → deny (return {}).
 *
 * Returning an empty object {} denies access.
 */

import {
	CognitoIdentityProviderClient,
	AdminInitiateAuthCommand,
	AdminGetUserCommand,
	AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({});

const {
	COGNITO_USER_POOL_ID,
	COGNITO_CLIENT_ID,
	TRANSFER_USER_ROLE_ARN,
	SUPER_ADMIN_ROLE_ARN,
	S3_BUCKET,
} = process.env;

export const handler = async (event) => {
	const { username, password, protocol = "SFTP" } = event;

	if (!username || !password) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "no-password",
				username,
				protocol,
			}),
		);
		return {};
	}

	// ── Step 1: Authenticate ────────────────────────────────────────────────
	let authResult;
	try {
		authResult = await cognito.send(
			new AdminInitiateAuthCommand({
				UserPoolId: COGNITO_USER_POOL_ID,
				ClientId: COGNITO_CLIENT_ID,
				AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
				AuthParameters: { USERNAME: username, PASSWORD: password },
			}),
		);
	} catch (err) {
		console.log(
			JSON.stringify({ result: "denied", reason: err.name, username }),
		);
		return {};
	}

	if (!authResult.AuthenticationResult?.AccessToken) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "challenge",
				challenge: authResult.ChallengeName,
				username,
			}),
		);
		return {};
	}

	// ── Step 2: Fetch user attributes and group membership in parallel ───────
	let userInfo, groupsInfo;
	try {
		[userInfo, groupsInfo] = await Promise.all([
			cognito.send(
				new AdminGetUserCommand({
					UserPoolId: COGNITO_USER_POOL_ID,
					Username: username,
				}),
			),
			cognito.send(
				new AdminListGroupsForUserCommand({
					UserPoolId: COGNITO_USER_POOL_ID,
					Username: username,
				}),
			),
		]);
	} catch (err) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "attribute-fetch-error",
				error: err.name,
				username,
			}),
		);
		return {};
	}

	const attrs = Object.fromEntries(
		(userInfo.UserAttributes ?? []).map((a) => [a.Name, a.Value]),
	);
	const companyId = attrs["custom:company_id"] ?? null;
	const isSuperAdmin = (groupsInfo.Groups ?? []).some(
		(g) => g.GroupName === "Super_Admin",
	);

	// ── Step 3a: Super Admin — full bucket access, no session-policy restriction ──
	if (isSuperAdmin) {
		console.log(
			JSON.stringify({
				result: "allowed",
				username,
				role: "super-admin",
				protocol,
			}),
		);
		return {
			Role: SUPER_ADMIN_ROLE_ARN,
			HomeDirectoryType: "PATH",
			HomeDirectory: `/${S3_BUCKET}`,
		};
	}

	// ── Step 3b: Company user — logical chroot to /<bucket>/<company_id> ────
	if (!companyId) {
		console.log(
			JSON.stringify({ result: "denied", reason: "no-company-id", username }),
		);
		return {};
	}

	// Session policy further restricts the role to this company's prefix only.
	// Effective permissions = role_permissions ∩ session_policy_permissions.
	const sessionPolicy = JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Sid: "ListCompanyFolder",
				Effect: "Allow",
				Action: ["s3:ListBucket"],
				Resource: `arn:aws:s3:::${S3_BUCKET}`,
				Condition: {
					StringLike: {
						"s3:prefix": [`${companyId}/*`, `${companyId}`],
					},
				},
			},
			{
				Sid: "CompanyObjectCRUD",
				Effect: "Allow",
				Action: [
					"s3:GetObject",
					"s3:PutObject",
					"s3:DeleteObject",
					"s3:GetObjectVersion",
					"s3:DeleteObjectVersion",
				],
				Resource: `arn:aws:s3:::${S3_BUCKET}/${companyId}/*`,
			},
		],
	});

	console.log(
		JSON.stringify({
			result: "allowed",
			username,
			companyId,
			role: "company-user",
			protocol,
		}),
	);

	return {
		Role: TRANSFER_USER_ROLE_ARN,
		HomeDirectoryType: "LOGICAL",
		// Logical chroot: the user's "/" maps to their company folder.
		// They cannot navigate above this; other companies are invisible.
		HomeDirectoryDetails: JSON.stringify([
			{ Entry: "/", Target: `/${S3_BUCKET}/${companyId}` },
		]),
		Policy: sessionPolicy,
	};
};
