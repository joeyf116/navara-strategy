"use client";

import { ThemeProvider } from "@/lib/theme";
import { QueryProvider } from "@/lib/query-provider";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <div className="min-h-screen bg-background">
          <DashboardSidebar />
          <main className="lg:pl-64">
            <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </QueryProvider>
    </ThemeProvider>
  );
}
