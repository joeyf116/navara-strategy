import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navara SFTP Hub",
  description: "Client upload and file-sharing hub backed by PostgreSQL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
