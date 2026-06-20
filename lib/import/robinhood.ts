import Papa from "papaparse";
import type { InstrumentType, OptionType, TradeAction, TradeTransaction } from "@/types/trading";

export type ImportIssue = {
  rowIndex: number;
  severity: "warning" | "error";
  message: string;
};

export type ImportPreview = {
  batchId: string;
  rows: TradeTransaction[];
  issues: ImportIssue[];
  duplicateIds: string[];
  columnMap: Record<string, string | undefined>;
};

const columnCandidates: Record<string, string[]> = {
  tradeDate: ["trade date", "date", "activity date", "process date"],
  settlementDate: ["settlement date", "settle date", "settle date"],
  symbol: ["symbol", "underlying symbol", "ticker", "instrument"],
  instrument: ["instrument", "instrument type", "type"],
  description: ["description", "raw description", "details"],
  action: ["action", "side", "trans code", "transaction code", "activity type"],
  quantity: ["quantity", "qty"],
  price: ["price", "average price", "avg price"],
  amount: ["amount", "net amount", "net", "total"],
  fees: ["fees", "regulatory fees", "fee"],
  optionType: ["option type", "call/put", "put/call"],
  strikePrice: ["strike", "strike price"],
  expirationDate: ["expiration", "expiration date", "expiry"]
};

export function parseRobinhoodInput(raw: string, existing: TradeTransaction[] = [], accountName = "Robinhood"): ImportPreview {
  const batchId = `import-${new Date().toISOString()}`;
  const parsed = Papa.parse<Record<string, string>>(stripRobinhoodFooter(raw).trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });
  const fields = parsed.meta.fields ?? [];
  const columnMap = detectColumns(fields);
  const issues: ImportIssue[] = [];
  const rows = parsed.data
    .map((row, index) => normalizeRow(row, index, batchId, accountName, columnMap, issues))
    .filter((row) => row.rawDescription || row.symbol || row.tradeDate || row.action !== "OTHER");
  const duplicateIds = detectDuplicates([...existing, ...rows]).filter((id) => rows.some((row) => row.id === id));
  for (const duplicateId of duplicateIds) {
    const rowIndex = rows.findIndex((row) => row.id === duplicateId);
    issues.push({ rowIndex, severity: "warning", message: "Likely duplicate transaction." });
  }
  return { batchId, rows, issues, duplicateIds, columnMap };
}

function stripRobinhoodFooter(raw: string) {
  const lines = raw.split(/\r?\n/);
  const footerIndex = lines.findIndex((line) => /data provided is for informational purposes only/i.test(line));
  return (footerIndex >= 0 ? lines.slice(0, footerIndex) : lines).join("\n");
}

export function detectColumns(fields: string[]) {
  const normalized = fields.map((field) => ({ original: field, normalized: normalizeHeader(field) }));
  const map: Record<string, string | undefined> = {};
  for (const [target, candidates] of Object.entries(columnCandidates)) {
    map[target] = normalized.find((field) => candidates.includes(field.normalized))?.original;
  }
  return map;
}

function normalizeRow(
  row: Record<string, string>,
  index: number,
  batchId: string,
  accountName: string,
  columnMap: Record<string, string | undefined>,
  issues: ImportIssue[]
): TradeTransaction {
  const get = (key: string) => (columnMap[key] ? row[columnMap[key] as string] : undefined)?.trim() ?? "";
  const rawDescription = get("description") || Object.values(row).filter(Boolean).join(" | ");
  const date = normalizeDate(get("tradeDate") || get("settlementDate"));
  const symbol = get("symbol") || inferSymbol(rawDescription);
  const rawAction = get("action");
  const initialAction = normalizeAction(rawAction, rawDescription);
  const isAssignmentStockLeg = /^(buy|sell)$/i.test(rawAction) && /options? assigned/i.test(rawDescription);
  const action = isAssignmentStockLeg ? "ASSIGNMENT" : initialAction;
  const optionType = normalizeOptionType(get("optionType"), rawDescription);
  const strikePrice = parseMoney(get("strikePrice")) || inferStrike(rawDescription);
  const expirationDate = normalizeDate(get("expirationDate")) || inferExpiration(rawDescription);
  const instrumentType = normalizeInstrument(get("instrument"), optionType, rawDescription, action);
  const quantity = Math.abs(parseNumber(get("quantity")) || inferQuantity(rawDescription));
  const price = parseMoney(get("price"));
  const fees = Math.abs(parseMoney(get("fees")));
  const amount = parseMoney(get("amount"));
  const status = isAssignmentStockLeg
    ? "ignored"
    : validateRow(index, { date, symbol, action, quantity, price, amount, instrumentType, optionType, strikePrice, expirationDate }, issues);
  return {
    id: `import-${hash([date, symbol, action, quantity, price, amount, rawDescription, index].join("|"))}`,
    sourceBroker: "Robinhood",
    accountName,
    tradeDate: date,
    settlementDate: normalizeDate(get("settlementDate")) || date,
    symbol,
    instrumentType,
    action,
    quantity,
    price,
    grossAmount: amount,
    fees,
    netAmount: amount - fees,
    optionType,
    strikePrice: strikePrice || undefined,
    expirationDate: expirationDate || undefined,
    underlyingSymbol: instrumentType === "option" ? symbol : undefined,
    rawDescription,
    importBatchId: batchId,
    notes: isAssignmentStockLeg ? "Robinhood assignment settlement stock leg; ignored to avoid double-counting the linked OASGN option assignment." : undefined,
    tags: [],
    status
  };
}

function validateRow(
  rowIndex: number,
  row: {
    date: string;
    symbol: string;
    action: TradeAction;
    quantity: number;
    price: number;
    amount: number;
    instrumentType: InstrumentType;
    optionType: OptionType;
    strikePrice: number;
    expirationDate: string;
  },
  issues: ImportIssue[]
) {
  let unresolved = false;
  const warn = (message: string) => {
    unresolved = true;
    issues.push({ rowIndex, severity: "warning", message });
  };
  if (!row.date) warn("Missing date.");
  if (!row.symbol && row.instrumentType !== "cash") warn("Missing symbol.");
  if (row.action === "OTHER") warn("Unknown transaction type.");
  if (!row.quantity && !["EXPIRATION", "ASSIGNMENT", "FEE", "DIVIDEND", "TRANSFER"].includes(row.action)) warn("Missing quantity.");
  if (!row.price && ["BUY", "SELL"].includes(row.action)) warn("Missing price.");
  if (!row.amount && !["EXPIRATION", "ASSIGNMENT"].includes(row.action)) warn("Missing amount.");
  if (row.instrumentType === "option" && !row.optionType) warn("Missing option type for options.");
  if (row.instrumentType === "option" && !row.strikePrice) warn("Missing option strike.");
  if (row.instrumentType === "option" && !row.expirationDate) warn("Missing option expiration.");
  return unresolved ? "unresolved" : "normalized";
}

function normalizeAction(value: string, description: string): TradeAction {
  const code = value.trim().toUpperCase();
  if (code === "STO") return "SELL_TO_OPEN";
  if (code === "BTC") return "BUY_TO_CLOSE";
  if (code === "BTO") return "BUY_TO_OPEN";
  if (code === "STC") return "SELL_TO_CLOSE";
  if (code === "OASGN") return "ASSIGNMENT";
  if (code === "OEXP") return "EXPIRATION";
  if (code === "CDIV" || code === "INT" || code === "GDBP" || code === "SLIP") return "DIVIDEND";
  if (code === "MINT") return "FEE";
  if (code === "ACH") return "TRANSFER";
  if (code === "SXCH" || code === "MISC") return "OTHER";
  const text = `${value} ${description}`.toLowerCase();
  if (text.includes("sell to open") || text.includes("sto")) return "SELL_TO_OPEN";
  if (text.includes("buy to close") || text.includes("btc")) return "BUY_TO_CLOSE";
  if (text.includes("buy to open")) return "BUY_TO_OPEN";
  if (text.includes("sell to close")) return "SELL_TO_CLOSE";
  if (text.includes("assign")) return "ASSIGNMENT";
  if (text.includes("expir")) return "EXPIRATION";
  if (text.includes("dividend")) return "DIVIDEND";
  if (text.includes("fee")) return "FEE";
  if (text.includes("transfer")) return "TRANSFER";
  if (/\bbuy\b/.test(text)) return "BUY";
  if (/\bsell\b|\bsold\b/.test(text)) return "SELL";
  return "OTHER";
}

function normalizeInstrument(value: string, optionType: OptionType, description: string, action: TradeAction): InstrumentType {
  const text = `${value} ${description}`.toLowerCase();
  if (optionType || /\b(call|put|\d+[cp])\b/.test(text)) return "option";
  if (["DIVIDEND", "FEE", "TRANSFER"].includes(action)) return "cash";
  if (["BUY", "SELL"].includes(action) || (action === "ASSIGNMENT" && /options? assigned/i.test(description))) return "stock";
  if (text.includes("stock") || text.includes("share") || text.includes("buy") || text.includes("sell")) return "stock";
  if (text.includes("cash")) return "cash";
  return "other";
}

function normalizeOptionType(value: string, description: string): OptionType {
  const text = `${value} ${description}`.toLowerCase();
  if (/\bcall\b|\d+c\b/.test(text)) return "call";
  if (/\bput\b|\d+p\b/.test(text)) return "put";
  return null;
}

function parseMoney(value: string) {
  if (!value) return 0;
  const negative = value.includes("(") && value.includes(")");
  const parsed = Number(value.replace(/[$,()]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/[,()]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function inferSymbol(description: string) {
  const match = description.match(/\b[A-Z]{1,5}\b/);
  return match?.[0] ?? "";
}

function inferQuantity(description: string) {
  const match = description.match(/\b(\d+(?:\.\d+)?)\s+(?:shares|share|contracts|contract)\b/i);
  return match ? Number(match[1]) : 0;
}

function inferStrike(description: string) {
  const match =
    description.match(/\b(?:call|put)\s+\$?(\d+(?:\.\d+)?)\b/i) ??
    description.match(/\$?(\d+(?:\.\d+)?)\s*(?:call|put|[CP]\b)/i);
  return match ? Number(match[1]) : 0;
}

function inferExpiration(description: string) {
  const match = description.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/);
  return match ? normalizeDate(match[1]) : "";
}

function detectDuplicates(transactions: TradeTransaction[]) {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const transaction of transactions) {
    const key = [
      transaction.tradeDate,
      transaction.symbol,
      transaction.action,
      transaction.quantity,
      transaction.price,
      transaction.netAmount,
      transaction.rawDescription
    ].join("|");
    if (seen.has(key)) duplicates.push(transaction.id);
    else seen.set(key, transaction.id);
  }
  return duplicates;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36);
}
