import {
	AdminCreateUserCommand,
	AdminDeleteUserCommand,
	AdminGetUserCommand,
	AdminListGroupsForUserCommand,
	CognitoIdentityProviderClient,
	ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

export type CompanyGrant = {
	companyId: string;
	canWrite: boolean;
};

export type UserCompanyAccess = {
	isSuperAdmin: boolean;
	grants: CompanyGrant[];
};

export type CognitoUserSummary = {
	username: string;
	email: string;
	name: string | null;
	enabled: boolean;
	status: string;
	createdAt: string | null;
	updatedAt: string | null;
};

export type CreateCognitoUserInput = {
	email: string;
	name?: string;
	temporaryPassword: string;
};

const filesBucket = process.env.FILES_BUCKET?.trim() || "";
const filesBucketPrefix = (
	process.env.FILES_BUCKET_PREFIX?.trim() || "uploads"
).replace(/^\/+|\/+$/g, "");
const s3Client = filesBucket ? new S3Client({}) : null;
const cognitoClient = new CognitoIdentityProviderClient({});

const COMPANY_SUBDIRS = ["to_navara", "from_navara"];

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function normalizeCompanyId(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

function encodeEmail(email: string): string {
	return encodeURIComponent(normalizeEmail(email));
}

function withPrefix(value: string): string {
	return filesBucketPrefix ? `${filesBucketPrefix}/${value}` : value;
}

function companyRootPrefix(companyId: string): string {
	return withPrefix(`${companyId}/`);
}

function companyAccessKey(email: string): string {
	return withPrefix(`.metadata/company-access/${encodeEmail(email)}.json`);
}

function companyIndexKey(): string {
	return withPrefix(`.metadata/companies/index.json`);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
	if (!body) return Buffer.alloc(0);
	if (body instanceof Uint8Array) return Buffer.from(body);
	const transformed = body as {
		transformToByteArray?: () => Promise<Uint8Array>;
	};
	if (typeof transformed.transformToByteArray === "function") {
		return Buffer.from(await transformed.transformToByteArray());
	}
	const iterable = body as AsyncIterable<Uint8Array>;
	if (typeof iterable[Symbol.asyncIterator] === "function") {
		const chunks: Buffer[] = [];
		for await (const chunk of iterable) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}
	throw new Error("Unsupported body type.");
}

function parseCompanyGrant(item: unknown): CompanyGrant | null {
	if (!item || typeof item !== "object") return null;
	const raw = item as Record<string, unknown>;
	const companyId = normalizeCompanyId(String(raw.companyId ?? ""));
	if (!companyId) return null;
	return {
		companyId,
		canWrite: raw.canWrite !== false,
	};
}

function mergeGrants(grants: CompanyGrant[]): CompanyGrant[] {
	const merged = new Map<string, CompanyGrant>();
	for (const grant of grants) {
		const normalizedId = normalizeCompanyId(grant.companyId);
		if (!normalizedId) continue;
		const existing = merged.get(normalizedId);
		merged.set(normalizedId, {
			companyId: normalizedId,
			canWrite: existing ? existing.canWrite || grant.canWrite : grant.canWrite,
		});
	}
	return [...merged.values()].sort((a, b) =>
		a.companyId.localeCompare(b.companyId),
	);
}

async function readS3Json<T>(key: string): Promise<T | null> {
	if (!filesBucket || !s3Client) return null;
	try {
		const resp = await s3Client.send(
			new GetObjectCommand({ Bucket: filesBucket, Key: key }),
		);
		const buf = await streamToBuffer(resp.Body);
		return JSON.parse(buf.toString("utf8")) as T;
	} catch (error: unknown) {
		if ((error as { name?: string }).name === "NoSuchKey") {
			return null;
		}
		throw error;
	}
}

async function writeS3Json(key: string, value: unknown): Promise<void> {
	if (!filesBucket || !s3Client) return;
	await s3Client.send(
		new PutObjectCommand({
			Bucket: filesBucket,
			Key: key,
			Body: JSON.stringify(value),
			ContentType: "application/json",
		}),
	);
}

async function deleteS3Object(key: string): Promise<void> {
	if (!filesBucket || !s3Client) return;
	try {
		await s3Client.send(
			new DeleteObjectCommand({
				Bucket: filesBucket,
				Key: key,
			}),
		);
	} catch (error: unknown) {
		if ((error as { name?: string }).name === "NoSuchKey") {
			return;
		}
		throw error;
	}
}

function getPoolIdFromIssuer(): string | null {
	const issuer = process.env.AUTH_COGNITO_ISSUER?.trim();
	if (!issuer) return null;
	try {
		const parsed = new URL(issuer);
		const poolId = parsed.pathname.split("/").filter(Boolean).at(-1);
		return poolId ?? null;
	} catch {
		return null;
	}
}

function escapeCognitoFilter(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findCognitoUsernameByEmail(
	poolId: string,
	emailRaw: string,
): Promise<string | null> {
	const email = normalizeEmail(emailRaw);
	if (!email) return null;

	const response = await cognitoClient.send(
		new ListUsersCommand({
			UserPoolId: poolId,
			Limit: 1,
			Filter: `email = "${escapeCognitoFilter(email)}"`,
		}),
	);

	const user = response.Users?.[0];
	const username = String(user?.Username ?? "").trim();
	return username || null;
}

async function resolveCognitoUsername(
	poolId: string,
	emailRaw: string,
): Promise<string | null> {
	const email = normalizeEmail(emailRaw);
	if (!email) return null;

	try {
		await cognitoClient.send(
			new AdminGetUserCommand({
				UserPoolId: poolId,
				Username: email,
			}),
		);
		return email;
	} catch {
		return findCognitoUsernameByEmail(poolId, email);
	}
}

async function readCognitoAccess(emailRaw: string): Promise<UserCompanyAccess> {
	const poolId = getPoolIdFromIssuer();
	const email = normalizeEmail(emailRaw);
	if (!poolId) {
		return { isSuperAdmin: false, grants: [] };
	}

	let username = email;
	try {
		await cognitoClient.send(
			new AdminGetUserCommand({
				UserPoolId: poolId,
				Username: username,
			}),
		);
	} catch {
		const resolved = await findCognitoUsernameByEmail(poolId, email);
		if (!resolved) {
			return { isSuperAdmin: false, grants: [] };
		}
		username = resolved;
	}

	const [user, groups] = await Promise.all([
		cognitoClient.send(
			new AdminGetUserCommand({
				UserPoolId: poolId,
				Username: username,
			}),
		),
		cognitoClient.send(
			new AdminListGroupsForUserCommand({
				UserPoolId: poolId,
				Username: username,
			}),
		),
	]);

	const attrs = Object.fromEntries(
		(user.UserAttributes ?? []).map((attr) => [attr.Name, attr.Value ?? ""]),
	);
	const isSuperAdmin = (groups.Groups ?? []).some((group) => {
		const name = (group.GroupName ?? "").trim().toLowerCase();
		return name === "super_admin" || name === "super-admin";
	});

	const fallback: CompanyGrant[] = [];
	const companyId = normalizeCompanyId(
		String(attrs["custom:company_id"] ?? ""),
	);
	if (companyId) {
		fallback.push({ companyId, canWrite: true });
	}

	return {
		isSuperAdmin,
		grants: mergeGrants(fallback),
	};
}

async function readStoredAccess(emailRaw: string): Promise<CompanyGrant[]> {
	const email = normalizeEmail(emailRaw);
	const payload = await readS3Json<{ grants?: unknown[] }>(
		companyAccessKey(email),
	);
	if (!payload?.grants || !Array.isArray(payload.grants)) {
		return [];
	}
	return mergeGrants(
		payload.grants
			.map((grant) => parseCompanyGrant(grant))
			.filter((grant): grant is CompanyGrant => grant !== null),
	);
}

async function deleteStoredAccess(emailRaw: string): Promise<void> {
	const email = normalizeEmail(emailRaw);
	if (!email) return;
	await deleteS3Object(companyAccessKey(email));
}

async function readCompanyIndex(): Promise<string[]> {
	const payload = await readS3Json<{ companies?: unknown[] }>(
		companyIndexKey(),
	);
	if (!payload?.companies || !Array.isArray(payload.companies)) {
		return [];
	}

	return [
		...new Set(
			payload.companies
				.map((item) => normalizeCompanyId(String(item ?? "")))
				.filter(Boolean),
		),
	].sort();
}

async function writeCompanyIndex(companies: string[]): Promise<void> {
	await writeS3Json(companyIndexKey(), {
		companies: [
			...new Set(
				companies.map((company) => normalizeCompanyId(company)).filter(Boolean),
			),
		].sort(),
	});
}

async function listCompaniesFromS3(): Promise<string[]> {
	if (!filesBucket || !s3Client) return [];
	const prefix = filesBucketPrefix ? `${filesBucketPrefix}/` : "";
	let continuationToken: string | undefined;
	const companies = new Set<string>();

	do {
		const resp = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: filesBucket,
				Prefix: prefix,
				Delimiter: "/",
				ContinuationToken: continuationToken,
			}),
		);
		for (const commonPrefix of resp.CommonPrefixes ?? []) {
			const full = commonPrefix.Prefix ?? "";
			const relative = prefix ? full.slice(prefix.length) : full;
			const company = normalizeCompanyId(relative.replace(/\/$/, ""));
			if (!company || company.startsWith(".")) continue;
			if (company === "user-files") continue;
			companies.add(company);
		}
		continuationToken = resp.NextContinuationToken;
	} while (continuationToken);

	return [...companies].sort();
}

export async function listAllCompanies(): Promise<string[]> {
	const [indexed, fromS3] = await Promise.all([
		readCompanyIndex(),
		listCompaniesFromS3(),
	]);
	return [...new Set([...indexed, ...fromS3])].sort();
}

export async function ensureCompanyFolders(
	companyIdRaw: string,
): Promise<void> {
	if (!filesBucket || !s3Client) return;
	const companyId = normalizeCompanyId(companyIdRaw);
	if (!companyId) throw new Error("Company ID is required.");

	for (const subdir of COMPANY_SUBDIRS) {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: filesBucket,
				Key: `${companyRootPrefix(companyId)}${subdir}/.keep`,
				Body: "",
				ContentType: "application/octet-stream",
			}),
		);
	}
}

export async function createCompany(companyIdRaw: string): Promise<string> {
	const companyId = normalizeCompanyId(companyIdRaw);
	if (!companyId) throw new Error("Valid company ID is required.");
	await ensureCompanyFolders(companyId);
	const existing = await listAllCompanies();
	await writeCompanyIndex([...existing, companyId]);
	return companyId;
}

export async function createCompanyAndAssignUsers(
	companyIdRaw: string,
	userEmailsRaw: string[],
): Promise<{ companyId: string; assignedUsers: string[] }> {
	const companyId = await createCompany(companyIdRaw);
	const userEmails = [
		...new Set(userEmailsRaw.map(normalizeEmail).filter(Boolean)),
	];

	for (const userEmail of userEmails) {
		const current = await getUserCompanyAccessForAdmin(userEmail);
		await setUserCompanyAccess(userEmail, [
			...current.grants,
			{ companyId, canWrite: true },
		]);
	}

	return { companyId, assignedUsers: userEmails };
}

export async function setUserCompanyAccess(
	userEmailRaw: string,
	grantsRaw: CompanyGrant[],
): Promise<CompanyGrant[]> {
	const userEmail = normalizeEmail(userEmailRaw);
	if (!userEmail) throw new Error("User email is required.");

	const grants = mergeGrants(grantsRaw);
	for (const grant of grants) {
		await createCompany(grant.companyId);
	}

	await writeS3Json(companyAccessKey(userEmail), {
		userEmail,
		grants,
		updatedAt: new Date().toISOString(),
	});

	return grants;
}

export async function setBulkUserCompanyAccess(
	userEmailsRaw: string[],
	grantsRaw: CompanyGrant[],
): Promise<Array<{ userEmail: string; grants: CompanyGrant[] }>> {
	const userEmails = [
		...new Set(userEmailsRaw.map(normalizeEmail).filter(Boolean)),
	];
	const grants = mergeGrants(grantsRaw);

	const results: Array<{ userEmail: string; grants: CompanyGrant[] }> = [];
	for (const userEmail of userEmails) {
		const updated = await setUserCompanyAccess(userEmail, grants);
		results.push({ userEmail, grants: updated });
	}

	return results;
}

export async function resolveUserCompanyAccess(
	userEmailRaw: string,
): Promise<UserCompanyAccess> {
	const userEmail = normalizeEmail(userEmailRaw);

	const [stored, cognito] = await Promise.all([
		readStoredAccess(userEmail),
		readCognitoAccess(userEmail).catch(() => ({
			isSuperAdmin: false,
			grants: [] as CompanyGrant[],
		})),
	]);

	const grants = mergeGrants([...stored, ...cognito.grants]);
	if (!cognito.isSuperAdmin) {
		return { isSuperAdmin: false, grants };
	}

	const allCompanies = await listAllCompanies();
	const superAdminGrants = mergeGrants([
		...grants,
		...allCompanies.map((companyId) => ({ companyId, canWrite: true })),
	]);
	return {
		isSuperAdmin: true,
		grants: superAdminGrants,
	};
}

export async function getUserCompanyAccessForAdmin(
	userEmailRaw: string,
): Promise<UserCompanyAccess> {
	const userEmail = normalizeEmail(userEmailRaw);
	const [stored, cognito] = await Promise.all([
		readStoredAccess(userEmail),
		readCognitoAccess(userEmail).catch(() => ({
			isSuperAdmin: false,
			grants: [] as CompanyGrant[],
		})),
	]);

	return {
		isSuperAdmin: cognito.isSuperAdmin,
		grants: mergeGrants([...stored, ...cognito.grants]),
	};
}

export async function createCognitoUser({
	email: emailRaw,
	name,
	temporaryPassword,
}: CreateCognitoUserInput): Promise<CognitoUserSummary> {
	const poolId = getPoolIdFromIssuer();
	if (!poolId) {
		throw new Error("Cognito user pool is not configured.");
	}

	const email = normalizeEmail(emailRaw);
	if (!email) {
		throw new Error("User email is required.");
	}

	const tempPassword = temporaryPassword.trim();
	if (!tempPassword) {
		throw new Error("Temporary password is required.");
	}

	const response = await cognitoClient.send(
		new AdminCreateUserCommand({
			UserPoolId: poolId,
			Username: email,
			TemporaryPassword: tempPassword,
			MessageAction: "SUPPRESS",
			UserAttributes: [
				{ Name: "email", Value: email },
				{ Name: "email_verified", Value: "true" },
				...(name?.trim() ? [{ Name: "name", Value: name.trim() }] : []),
			],
		}),
	);

	const attributes = Object.fromEntries(
		(response.User?.Attributes ?? []).map((attribute) => [
			attribute.Name,
			attribute.Value ?? "",
		]),
	);

	return {
		username: String(response.User?.Username ?? email),
		email,
		name: String(attributes.name ?? "").trim() || null,
		enabled: response.User?.Enabled !== false,
		status: String(response.User?.UserStatus ?? "FORCE_CHANGE_PASSWORD"),
		createdAt: parseCognitoDate(response.User?.UserCreateDate),
		updatedAt: parseCognitoDate(response.User?.UserLastModifiedDate),
	};
}

export async function deleteCognitoUser(
	userEmailRaw: string,
): Promise<{ userEmail: string }> {
	const poolId = getPoolIdFromIssuer();
	if (!poolId) {
		throw new Error("Cognito user pool is not configured.");
	}

	const userEmail = normalizeEmail(userEmailRaw);
	if (!userEmail) {
		throw new Error("User email is required.");
	}

	const username = await resolveCognitoUsername(poolId, userEmail);
	if (!username) {
		throw new Error("User not found in Cognito.");
	}

	await cognitoClient.send(
		new AdminDeleteUserCommand({
			UserPoolId: poolId,
			Username: username,
		}),
	);
	await deleteStoredAccess(userEmail);

	return { userEmail };
}

function parseCognitoDate(value: Date | undefined): string | null {
	if (!value) return null;
	const timestamp = value.getTime();
	if (Number.isNaN(timestamp)) return null;
	return value.toISOString();
}

export async function listCognitoUsers(): Promise<CognitoUserSummary[]> {
	const poolId = getPoolIdFromIssuer();
	if (!poolId) return [];

	const users: CognitoUserSummary[] = [];
	let paginationToken: string | undefined;

	do {
		const response = await cognitoClient.send(
			new ListUsersCommand({
				UserPoolId: poolId,
				Limit: 60,
				PaginationToken: paginationToken,
			}),
		);

		for (const user of response.Users ?? []) {
			const attributes = Object.fromEntries(
				(user.Attributes ?? []).map((attribute) => [
					attribute.Name,
					attribute.Value ?? "",
				]),
			);
			const username = String(user.Username ?? "").trim();
			if (!username) continue;
			const email = normalizeEmail(String(attributes.email ?? username));
			users.push({
				username,
				email,
				name: String(attributes.name ?? "").trim() || null,
				enabled: user.Enabled !== false,
				status: String(user.UserStatus ?? "UNKNOWN"),
				createdAt: parseCognitoDate(user.UserCreateDate),
				updatedAt: parseCognitoDate(user.UserLastModifiedDate),
			});
		}

		paginationToken = response.PaginationToken;
	} while (paginationToken);

	return users.sort((a, b) => a.email.localeCompare(b.email));
}
