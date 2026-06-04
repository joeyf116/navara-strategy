import { NextResponse } from "next/server";

function resolveRegionFromIssuer(): string | null {
	const issuer = process.env.AUTH_COGNITO_ISSUER?.trim();
	if (!issuer) return null;
	try {
		const hostname = new URL(issuer).hostname;
		const parts = hostname.split(".");
		return parts[1] ?? null;
	} catch {
		return null;
	}
}

function resolveCognitoDomain(): string | null {
	const configured = process.env.COGNITO_DOMAIN?.trim();
	if (!configured) return null;

	if (configured.startsWith("http://") || configured.startsWith("https://")) {
		return configured;
	}

	if (configured.includes("amazoncognito.com")) {
		return `https://${configured}`;
	}

	const region = resolveRegionFromIssuer();
	if (!region) return null;
	return `https://${configured}.auth.${region}.amazoncognito.com`;
}

export async function GET() {
	const clientId = process.env.AUTH_COGNITO_ID?.trim() || "";
	const appUrl =
		process.env.NEXTAUTH_URL?.trim() || process.env.AUTH_URL?.trim() || "";
	const domain = resolveCognitoDomain();

	if (!clientId || !appUrl || !domain) {
		return NextResponse.json({ logoutUrl: "/login" });
	}

	const logoutUri = new URL("/login", appUrl).toString();
	const url = new URL("/logout", domain);
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("logout_uri", logoutUri);

	return NextResponse.json({ logoutUrl: url.toString() });
}
