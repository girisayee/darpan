import type { TradeTransaction } from "@/types/trading";

export function stockTx(id: string, date: string, action: "BUY" | "SELL", symbol: string, quantity: number, price: number, fees = 0): TradeTransaction {
  const grossAmount = quantity * price * (action === "BUY" ? -1 : 1);
  return {
    id,
    sourceBroker: "Robinhood",
    accountName: "Test",
    tradeDate: date,
    settlementDate: date,
    symbol,
    instrumentType: "stock",
    action,
    quantity,
    price,
    grossAmount,
    fees,
    netAmount: grossAmount,
    optionType: null,
    rawDescription: `${action} ${quantity} ${symbol} @ ${price}`,
    importBatchId: "test",
    tags: [],
    status: "normalized"
  };
}

export function optionTx(
  id: string,
  date: string,
  action: "SELL_TO_OPEN" | "BUY_TO_CLOSE" | "EXPIRATION" | "ASSIGNMENT",
  symbol: string,
  optionType: "call" | "put",
  strike: number,
  expiration: string,
  amount: number,
  fees = 0
): TradeTransaction {
  return {
    id,
    sourceBroker: "Robinhood",
    accountName: "Test",
    tradeDate: date,
    settlementDate: date,
    symbol,
    underlyingSymbol: symbol,
    instrumentType: "option",
    action,
    quantity: 1,
    price: Math.abs(amount) / 100,
    grossAmount: amount,
    fees,
    netAmount: amount,
    optionType,
    strikePrice: strike,
    expirationDate: expiration,
    rawDescription: `${action} ${symbol} ${strike}${optionType === "call" ? "C" : "P"} ${expiration}`,
    importBatchId: "test",
    tags: [],
    status: "normalized"
  };
}
