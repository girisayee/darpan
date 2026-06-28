import type { TradeTransaction } from "@/types/trading";

const batch = "sample-2026";

function stock(
  id: string,
  tradeDate: string,
  symbol: string,
  action: "BUY" | "SELL",
  quantity: number,
  price: number,
  notes = ""
): TradeTransaction {
  const gross = quantity * price * (action === "BUY" ? -1 : 1);
  return {
    id,
    sourceBroker: "Robinhood",
    accountName: "Sample",
    tradeDate,
    settlementDate: tradeDate,
    symbol,
    instrumentType: "stock",
    action,
    quantity,
    price,
    grossAmount: gross,
    fees: 0,
    netAmount: gross,
    optionType: null,
    rawDescription: `${action} ${quantity} ${symbol} @ ${price} ${notes}`.trim(),
    importBatchId: batch,
    tags: ["sample"],
    status: "normalized"
  };
}

function option(
  id: string,
  tradeDate: string,
  symbol: string,
  action: "SELL_TO_OPEN" | "BUY_TO_CLOSE" | "EXPIRATION" | "ASSIGNMENT",
  optionType: "call" | "put",
  contracts: number,
  strikePrice: number,
  expirationDate: string,
  netAmount: number,
  raw: string
): TradeTransaction {
  return {
    id,
    sourceBroker: "Robinhood",
    accountName: "Sample",
    tradeDate,
    settlementDate: tradeDate,
    symbol,
    underlyingSymbol: symbol,
    instrumentType: "option",
    action,
    quantity: contracts,
    price: Math.abs(netAmount) / Math.max(contracts * 100, 1),
    grossAmount: netAmount,
    fees: 0,
    netAmount,
    optionType,
    strikePrice,
    expirationDate,
    rawDescription: raw,
    importBatchId: batch,
    tags: ["sample"],
    status: "normalized"
  };
}

export const sampleTransactions: TradeTransaction[] = [
  stock("s-001", "2025-01-02", "AAPL", "BUY", 100, 150, "covered call collateral"),
  option("s-002", "2025-01-03", "AAPL", "SELL_TO_OPEN", "call", 1, 165, "2025-01-31", 250, "Sold AAPL 165C exp 2025-01-31"),
  option("s-003", "2025-01-31", "AAPL", "EXPIRATION", "call", 1, 165, "2025-01-31", 0, "AAPL 165C expired worthless"),

  stock("s-004", "2025-02-03", "AMD", "BUY", 100, 118, "covered call collateral"),
  option("s-005", "2025-02-04", "AMD", "SELL_TO_OPEN", "call", 1, 125, "2025-02-28", 240, "Sold AMD 125C exp 2025-02-28"),
  option("s-006", "2025-02-28", "AMD", "ASSIGNMENT", "call", 1, 125, "2025-02-28", 0, "AMD 125C assigned"),

  stock("s-007", "2025-03-03", "MSFT", "BUY", 100, 410, "large capital swing"),
  stock("s-008", "2025-03-28", "MSFT", "SELL", 100, 424, "high P&L lower ROI"),

  option("s-009", "2025-04-01", "TSLA", "SELL_TO_OPEN", "put", 1, 170, "2025-04-25", 255, "Sold TSLA 170P exp 2025-04-25"),
  option("s-010", "2025-04-25", "TSLA", "EXPIRATION", "put", 1, 170, "2025-04-25", 0, "TSLA 170P expired worthless"),

  option("s-011", "2025-05-02", "NVDA", "SELL_TO_OPEN", "put", 1, 92, "2025-05-30", 210, "Sold NVDA 92P exp 2025-05-30"),
  option("s-012", "2025-05-30", "NVDA", "ASSIGNMENT", "put", 1, 92, "2025-05-30", 0, "NVDA 92P assigned"),

  stock("s-013", "2025-06-03", "NVDA", "SELL", 50, 101, "partial sale of assigned put lot"),
  stock("s-014", "2025-06-10", "GOOGL", "BUY", 40, 166, "profitable swing"),
  stock("s-015", "2025-06-24", "GOOGL", "SELL", 40, 176, "fast efficient swing"),

  stock("s-016", "2025-07-02", "META", "BUY", 30, 520, "losing swing"),
  stock("s-017", "2025-07-25", "META", "SELL", 30, 501, "loss"),

  stock("s-018", "2025-08-01", "AAPL", "BUY", 100, 184, "covered call collateral"),
  option("s-019", "2025-08-04", "AAPL", "SELL_TO_OPEN", "call", 1, 195, "2025-08-29", 370, "Sold AAPL 195C exp 2025-08-29 about 2 percent"),
  option("s-020", "2025-08-29", "AAPL", "EXPIRATION", "call", 1, 195, "2025-08-29", 0, "AAPL 195C expired worthless"),

  option("s-021", "2025-09-03", "AMD", "SELL_TO_OPEN", "put", 1, 105, "2025-09-26", 130, "Sold AMD 105P exp 2025-09-26"),
  option("s-022", "2025-09-12", "AMD", "BUY_TO_CLOSE", "put", 1, 105, "2025-09-26", -310, "Bought back AMD 105P at a loss"),

  stock("s-023", "2025-10-01", "TSLA", "BUY", 50, 242, "swing trade"),
  stock("s-024", "2025-10-18", "TSLA", "SELL", 50, 257, "profitable swing"),

  stock("s-025", "2025-11-04", "GOOGL", "BUY", 25, 171, "small swing"),
  stock("s-026", "2025-11-26", "GOOGL", "SELL", 25, 179, "small win"),

  stock("s-027", "2025-12-02", "MSFT", "BUY", 25, 437, "covered call collateral"),
  option("s-028", "2025-12-03", "MSFT", "SELL_TO_OPEN", "call", 1, 450, "2025-12-27", 180, "Sold MSFT 450C exp 2025-12-27"),
  option("s-029", "2025-12-16", "MSFT", "BUY_TO_CLOSE", "call", 1, 450, "2025-12-27", -430, "Bought back MSFT 450C at loss"),

  stock("s-030", "2026-01-05", "AAPL", "BUY", 40, 188, "YTD swing"),
  stock("s-031", "2026-01-22", "AAPL", "SELL", 40, 193, "YTD win"),
  option("s-032", "2026-02-03", "META", "SELL_TO_OPEN", "put", 1, 480, "2026-02-27", 720, "Large collateral put"),
  option("s-033", "2026-02-27", "META", "EXPIRATION", "put", 1, 480, "2026-02-27", 0, "META 480P expired worthless"),
  {
    id: "s-034",
    sourceBroker: "Robinhood",
    accountName: "Sample",
    tradeDate: "2026-03-04",
    settlementDate: "2026-03-04",
    symbol: "UNKNOWN",
    instrumentType: "other",
    action: "OTHER",
    quantity: 0,
    price: 0,
    grossAmount: 0,
    fees: 0,
    netAmount: 0,
    optionType: null,
    rawDescription: "Ambiguous journal entry imported from Robinhood",
    importBatchId: batch,
    notes: "Included to exercise unresolved import warnings.",
    tags: ["sample", "unresolved"],
    status: "unresolved"
  }
];
