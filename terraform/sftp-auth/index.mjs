/**
 * AWS Transfer Family custom identity provider.
 *
 * Flow:
 *  1. Authenticate Cognito username/password.
 *  2. Fetch groups + attributes.
 *  3. Resolve companies from custom:company_id plus metadata grants.
 *  4. Super_Admin: full bucket access. Other users: logical root with one
 *     entry per accessible company and session policy scoped to those prefixes.
 */

import {
	CognitoIdentityProviderClient,
	AdminInitiateAuthCommand,
	AdminGetUserCommand,
	AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const cognito = new CognitoIdentityProviderClient({});
const s3 = new S3Client({});

const {
	COGNITO_USER_POOL_ID,
	COGNITO_CLIENT_ID,
	TRANSFER_USER_ROLE_ARN,
	SUPER_ADMIN_ROLE_ARN,
	S3_BUCKET,
	FILES_BUCKET_PREFIX,
} = process.env;

function normalizeCompanyId(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

function normalizeEmail(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function withPrefix(value) {
	const prefix = (FILES_BUCKET_PREFIX ?? "uploads").replace(/^\/+|\/+$/g, "");
	return prefix ? `${prefix}/${value}` : value;
}

function companyAccessKey(email) {
	return withPrefix(
		`.metadata/company-access/${encodeURIComponent(email)}.json`,
	);
}

async function streamToBuffer(body) {
	if (!body) return Buffer.alloc(0);
	if (body instanceof Uint8Array) return Buffer.from(body);
	if (typeof body.transformToByteArray === "function") {
		return Buffer.from(await body.transformToByteArray());
	}
	if (typeof body[Symbol.asyncIterator] === "function") {
		const chunks = [];
		for await (const chunk of body) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}
	throw new Error("Unsupported response body type");
}

async function readCompanyAccessFromMetadata(email) {
	try {
		const resp = await s3.send(
			new GetObjectCommand({
				Bucket: S3_BUCKET,
				Key: companyAccessKey(email),
			}),
		);
		const body = await streamToBuffer(resp.Body);
		const payload = JSON.parse(body.toString("utf8"));
		if (!Array.isArray(payload?.grants)) {
			return [];
		}

		return payload.grants
			.map((grant) => normalizeCompanyId(grant?.companyId))
			.filter(Boolean);
	} catch (error) {
		if (error?.name === "NoSuchKey") return [];
		console.log(
			JSON.stringify({
				result: "warn",
				reason: "company-access-read-failed",
				error: error?.name,
				email,
			}),
		);
		return [];
	}
}

function buildSessionPolicy(companies) {
	const prefixes = companies.flatMap((companyId) => [
		`${companyId}`,
		`${companyId}/*`,
	]);
	const objectArns = companies.map(
		(companyId) => `arn:aws:s3:::${S3_BUCKET}/${companyId}/*`,
	);

	return JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Sid: "ListGrantedCompanyFolders",
				Effect: "Allow",
				Action: ["s3:ListBucket"],
				Resource: `arn:aws:s3:::${S3_BUCKET}`,
				Condition: {
					StringLike: {
						"s3:prefix": prefixes,
					},
				},
			},
			{
				Sid: "GrantedCompanyObjectCRUD",
				Effect: "Allow",
				Action: [
					"s3:GetObject",
					"s3:PutObject",
					"s3:DeleteObject",
					"s3:GetObjectVersion",
					"s3:DeleteObjectVersion",
				],
				Resource: objectArns,
			},
		],
	});
}

function buildHomeDirectoryDetails(companies) {
	if (companies.length === 1) {
		return JSON.stringify([
			{ Entry: "/", Target: `/${S3_BUCKET}/${companies[0]}` },
		]);
	}

	return JSON.stringify(
		companies.map((companyId) => ({
			Entry: `/${companyId}`,
			Target: `/${S3_BUCKET}/${companyId}`,
		})),
	);
}

export const handler = async (event) => {
	const { username, password, protocol = "SFTP" } = event;

	if (!username || !password) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "missing-credentials",
				username,
				protocol,
			}),
		);
		return {};
	}

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
	} catch (error) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: error?.name,
				username,
				protocol,
			}),
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
				protocol,
			}),
		);
		return {};
	}

	let userInfo;
	let groupsInfo;
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
	} catch (error) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "attribute-fetch-error",
				error: error?.name,
				username,
				protocol,
			}),
		);
		return {};
	}

	const attrs = Object.fromEntries(
		(userInfo.UserAttributes ?? []).map((attr) => [attr.Name, attr.Value]),
	);
	const isSuperAdmin = (groupsInfo.Groups ?? []).some((group) => {
		const groupName = String(group.GroupName ?? "").toLowerCase();
		return groupName === "super_admin" || groupName === "super-admin";
	});

	if (isSuperAdmin) {
		console.log(
			JSON.stringify({
				result: "allowed",
				role: "super-admin",
				username,
				protocol,
			}),
		);
		return {
			Role: SUPER_ADMIN_ROLE_ARN,
			HomeDirectoryType: "PATH",
			HomeDirectory: `/${S3_BUCKET}`,
		};
	}

	const userEmail = normalizeEmail(attrs.email || username);
	const metadataCompanies = await readCompanyAccessFromMetadata(userEmail);
	const companyFromAttr = normalizeCompanyId(attrs["custom:company_id"]);
	const companies = [
		...new Set([...metadataCompanies, companyFromAttr].filter(Boolean)),
	];

	if (companies.length === 0) {
		console.log(
			JSON.stringify({
				result: "denied",
				reason: "no-company-access",
				username,
				protocol,
			}),
		);
		return {};
	}

	console.log(
		JSON.stringify({
			result: "allowed",
			role: "company-user",
			username,
			protocol,
			companies,
		}),
	);

	return {
		Role: TRANSFER_USER_ROLE_ARN,
		HomeDirectoryType: "LOGICAL",
		HomeDirectoryDetails: buildHomeDirectoryDetails(companies),
		Policy: buildSessionPolicy(companies),
	};
};
