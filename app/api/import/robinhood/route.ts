import { NextResponse } from "next/server";
import { parseRobinhoodInput } from "@/lib/import/robinhood";
import { getDbSettings, listDbTransactions, replaceDbTransactions } from "@/lib/db/database";

export const runtime = "nodejs";

const DEV_USER = "dev-user";

export async function POST(request: Request) {
  const body = (await request.json()) as { raw?: string; mode?: "replace" | "append" };
  const existing = body.mode === "append" ? await listDbTransactions(DEV_USER) : [];
  const raw = Array.isArray(body.raw) ? body.raw.join("\n") : String(body.raw ?? "");
  const preview = parseRobinhoodInput(raw, existing);
  const rows = preview.rows;
  const nextTransactions = body.mode === "append" ? [...existing, ...rows] : rows;
  await replaceDbTransactions(DEV_USER, nextTransactions);
  return NextResponse.json({
    transactions: nextTransactions,
    settings: await getDbSettings(DEV_USER),
    summary: {
      parsedRows: preview.rows.length,
      savedRows: rows.length,
      duplicateRows: preview.duplicateIds.length,
      unresolvedRows: rows.filter((row) => row.status === "unresolved").length,
      ignoredRows: rows.filter((row) => row.status === "ignored").length,
      warningCount: preview.issues.length,
    },
  });
}
