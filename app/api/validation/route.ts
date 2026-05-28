import { NextResponse } from "next/server";
import { getValidationSummary, getDefaultValidationRules } from "@/lib/ingestion-validation";

export async function GET() {
  const summary = getValidationSummary();
  const rules = getDefaultValidationRules();

  return NextResponse.json({
    summary,
    rules,
  });
}
