import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Always pass through: auth API callbacks and WebDAV (uses app-password basic auth)
	if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/dav")) {
		return NextResponse.next();
	}

	// skipTrailingSlashRedirect is enabled for WebDAV, so normalize trailing
	// slashes for everything else here.
	if (pathname.length > 1 && pathname.endsWith("/")) {
		const url = req.nextUrl.clone();
		url.pathname = pathname.replace(/\/+$/, "");
		return NextResponse.redirect(url, 308);
	}

	const session = await auth();
	const isLoggedIn = !!session?.user;

	// Redirect authenticated users away from login
	if (pathname === "/login") {
		if (isLoggedIn) {
			return NextResponse.redirect(new URL("/files", req.nextUrl));
		}
		return NextResponse.next();
	}

	// All other routes require authentication
	if (!isLoggedIn) {
		const loginUrl = new URL("/login", req.nextUrl);
		if (!pathname.startsWith("/api/")) {
			loginUrl.searchParams.set("callbackUrl", pathname);
		}
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		// Match all paths except Next.js internals and static files
		"/((?!_next/static|_next/image|favicon\\.ico).*)",
	],
};
