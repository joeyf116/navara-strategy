import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// WebDAV clients (Windows mini-redirector in particular) do not follow
	// redirects, so collection paths like /api/dav/folder/ must be served
	// directly instead of 308-redirecting to the non-slash form. Trailing-slash
	// normalization for regular pages is handled in proxy.ts.
	skipTrailingSlashRedirect: true,
};

export default nextConfig;
