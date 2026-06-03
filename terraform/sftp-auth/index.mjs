/**
 * AWS Transfer Family custom identity provider.
 *
 * Transfer Family invokes this Lambda when a client connects via SFTP.
 * We validate the supplied username (email) + password against Cognito,
 * then return the S3 home directory for that user.
 *
 * Returning an empty object {} denies access.
 */

import {
	CognitoIdentityProviderClient,
	AdminInitiateAuthCommand,
	AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({});

const {
	COGNITO_USER_POOL_ID,
	COGNITO_CLIENT_ID,
	TRANSFER_USER_ROLE_ARN,
	S3_BUCKET,
} = process.env;

export const handler = async (event) => {
	const { username, password, serverId, protocol = "SFTP" } = event;

	// Only handle password-based auth (public key events have no password)
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

	try {
		const authResponse = await cognito.send(
			new AdminInitiateAuthCommand({
				UserPoolId: COGNITO_USER_POOL_ID,
				ClientId: COGNITO_CLIENT_ID,
				AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
				AuthParameters: {
					USERNAME: username,
					PASSWORD: password,
				},
			}),
		);

		// If Cognito returns a challenge (e.g. NEW_PASSWORD_REQUIRED), deny access.
		// The user should log into the web portal first to set their permanent password.
		if (!authResponse.AuthenticationResult?.AccessToken) {
			const challenge = authResponse.ChallengeName ?? "unknown";
			console.log(
				JSON.stringify({
					result: "denied",
					reason: "challenge",
					challenge,
					username,
				}),
			);
			return {};
		}

		// Fetch user attributes to find the explicit sftp_folder override (optional).
		const userInfo = await cognito.send(
			new AdminGetUserCommand({
				UserPoolId: COGNITO_USER_POOL_ID,
				Username: username,
			}),
		);

		const sftpFolderAttr = userInfo.UserAttributes?.find(
			(a) => a.Name === "custom:sftp_folder",
		);
		const folder = sftpFolderAttr?.Value ?? deriveFolder(username);

		console.log(
			JSON.stringify({ result: "allowed", username, folder, protocol }),
		);

		return {
			Role: TRANSFER_USER_ROLE_ARN,
			HomeDirectoryType: "LOGICAL",
			HomeDirectoryDetails: JSON.stringify([
				{ Entry: "/", Target: `/${S3_BUCKET}/${folder}` },
			]),
		};
	} catch (err) {
		// NotAuthorizedException, UserNotFoundException, UserNotConfirmedException, etc.
		console.log(
			JSON.stringify({ result: "denied", reason: err.name, username }),
		);
		return {};
	}
};

/**
 * Derives a safe S3 folder path from an email address.
 * user@example.com → clients/user-example-com
 * This is used as a fallback when custom:sftp_folder is not set on the Cognito user.
 */
function deriveFolder(email) {
	const sanitized = email
		.toLowerCase()
		.replace(/@/g, "-")
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return `clients/${sanitized}`;
}
