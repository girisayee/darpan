import { NextResponse } from "next/server";
import type { AppSettings, TradeTransaction } from "@/types/trading";
import { clearDbData, getDbSettings, listDbTransactions, replaceDbTransactions, saveDbSettings } from "@/lib/db/database";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    transactions: listDbTransactions(),
    settings: getDbSettings()
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    transactions?: TradeTransaction[];
    settings?: AppSettings;
  };
  if (Array.isArray(body.transactions)) {
    replaceDbTransactions(body.transactions);
  }
  if (body.settings) {
    saveDbSettings(body.settings);
  }
  return NextResponse.json({
    transactions: listDbTransactions(),
    settings: getDbSettings()
  });
}

export async function DELETE() {
  clearDbData();
  return NextResponse.json({
    transactions: [],
    settings: getDbSettings()
  });
}
