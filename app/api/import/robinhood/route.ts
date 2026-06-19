import { NextResponse } from "next/server";
import { parseRobinhoodInput } from "@/lib/import/robinhood";
import { getDbSettings, listDbTransactions, replaceDbTransactions } from "@/lib/db/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    raw?: string;
    mode?: "replace" | "append";
  };
  const existing = body.mode === "append" ? listDbTransactions() : [];
  const raw = Array.isArray(body.raw) ? body.raw.join("\n") : String(body.raw ?? "");
  const preview = parseRobinhoodInput(raw, existing);
  const rows = preview.rows;
  const nextTransactions = body.mode === "append" ? [...existing, ...rows] : rows;
  replaceDbTransactions(nextTransactions);
  return NextResponse.json({
    transactions: nextTransactions,
    settings: getDbSettings(),
    summary: {
      parsedRows: preview.rows.length,
      savedRows: rows.length,
      duplicateRows: preview.duplicateIds.length,
      unresolvedRows: rows.filter((row) => row.status === "unresolved").length,
      ignoredRows: rows.filter((row) => row.status === "ignored").length,
      warningCount: preview.issues.length
    }
  });
}
