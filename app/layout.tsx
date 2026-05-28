import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
	title: "Navara Insights Portal",
	description:
		"Operational insights, platform health monitoring, and administrative management",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="h-full antialiased" suppressHydrationWarning>
			<body className="min-h-full bg-background text-foreground">
				<ThemeProvider>{children}</ThemeProvider>
			</body>
		</html>
	);
}
