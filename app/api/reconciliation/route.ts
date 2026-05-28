import { NextResponse } from "next/server";
import { getReconciliationSummary } from "@/lib/reconciliation";

export async function GET() {
  const summary = getReconciliationSummary();

  return NextResponse.json({
    summary,
  });
}
