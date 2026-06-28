import { describe, expect, it } from "vitest";
import { parseTransactionsCsv as parseRobinhoodInput } from "@/lib/import/transactions";

describe("Robinhood import", () => {
  it("normalizes stock rows", () => {
    const csv = "Date,Symbol,Action,Quantity,Price,Amount,Description\n2025-01-02,AMD,Buy,100,10,-1000,Buy 100 AMD @ 10";
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0].action).toBe("BUY");
    expect(preview.rows[0].instrumentType).toBe("stock");
    expect(preview.rows[0].status).toBe("normalized");
  });

  it("treats a dividend-reinvestment Buy as a stock purchase, not a dropped dividend", () => {
    // Trans Code "Buy" with "Dividend Reinvestment" in the description must classify
    // as a stock BUY (it adds shares), not fall through to the cash/dividend match.
    const csv = [
      "Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount",
      "3/18/2026,UNH,UnitedHealth Dividend Reinvestment,Buy,0.386794,$287.57,($111.23)",
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0].action).toBe("BUY");
    expect(preview.rows[0].instrumentType).toBe("stock");
    expect(preview.rows[0].quantity).toBeCloseTo(0.386794, 6);
  });

  it("still classifies a CDIV cash dividend as a dividend", () => {
    const csv = [
      "Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount",
      "3/17/2026,UNH,Cash Div: R/D 2026-03-09 - 50.33 shares at 2.21,CDIV,,,$111.23",
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0].action).toBe("DIVIDEND");
    expect(preview.rows[0].instrumentType).toBe("cash");
  });

  it("flags unknown import rows", () => {
    const csv = "Date,Symbol,Action,Quantity,Price,Amount,Description\n2025-01-02,,Journal,0,0,0,Ambiguous Robinhood journal";
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0].status).toBe("unresolved");
    expect(preview.issues.some((issue) => issue.message.includes("Unknown"))).toBe(true);
  });

  it("detects duplicate import rows", () => {
    const csv = [
      "Date,Symbol,Action,Quantity,Price,Amount,Description",
      "2025-01-02,AMD,Buy,100,10,-1000,Buy 100 AMD @ 10",
      "2025-01-02,AMD,Buy,100,10,-1000,Buy 100 AMD @ 10"
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.duplicateIds).toHaveLength(1);
  });

  it("maps option fields", () => {
    const csv = "Trade Date,Symbol,Action,Quantity,Amount,Option Type,Strike,Expiration,Description\n2025-01-02,AMD,Sell to Open,1,150,put,50,2025-01-31,Sell to open AMD 50 put";
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0].instrumentType).toBe("option");
    expect(preview.rows[0].optionType).toBe("put");
    expect(preview.rows[0].strikePrice).toBe(50);
  });

  it("supports Robinhood account activity report option rows", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"6/1/2026","6/1/2026","6/2/2026","MOD","MOD 6/18/2026 Put $280.00","STO","1","$16.00","$1,599.91"',
      '"5/29/2026","5/29/2026","6/1/2026","MDB","MDB 5/29/2026 Call $325.00","BTC","1","$12.10","($1,210.04)"',
      '"3/27/2026","3/27/2026","3/30/2026","CLS","Option Expiration for CLS 3/27/2026 Put $257.50","OEXP","1","",""'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0]).toMatchObject({
      tradeDate: "2026-06-01",
      settlementDate: "2026-06-02",
      symbol: "MOD",
      action: "SELL_TO_OPEN",
      instrumentType: "option",
      optionType: "put",
      strikePrice: 280,
      expirationDate: "2026-06-18",
      quantity: 1,
      netAmount: 1599.91,
      status: "normalized"
    });
    expect(preview.rows[1]).toMatchObject({ action: "BUY_TO_CLOSE", optionType: "call", strikePrice: 325, netAmount: -1210.04 });
    expect(preview.rows[2]).toMatchObject({ action: "EXPIRATION", optionType: "put", strikePrice: 257.5, expirationDate: "2026-03-27" });
  });

  it("supports multiline stock descriptions in Robinhood activity reports", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"6/1/2026","6/1/2026","6/2/2026","HPE","HP Enterprise\nCUSIP: 42824C109","Buy","100","$45.00","($4,500.00)"'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      tradeDate: "2026-06-01",
      symbol: "HPE",
      instrumentType: "stock",
      action: "BUY",
      quantity: 100,
      price: 45,
      netAmount: -4500,
      status: "normalized"
    });
  });

  it("keeps Robinhood assignment stock settlement rows from double-counting", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"5/1/2026","5/1/2026","5/4/2026","CLS","CLS 5/1/2026 Call $350.00","OASGN","1","",""',
      '"5/1/2026","5/1/2026","5/4/2026","CLS","Celestica CUSIP: 15101Q207 1 CLS Option Assigned","Sell","100","$350.00","$34,999.25"',
      '"4/9/2026","4/9/2026","4/10/2026","SNOW","SNOW 6/18/2026 Put $230.00","OASGN","1","",""',
      '"4/9/2026","4/9/2026","4/10/2026","SNOW","Snowflake CUSIP: 833445109 1 SNOW Option Assigned","Buy","100","$230.00","($23,000.00)"'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "option", optionType: "call", strikePrice: 350, status: "normalized" });
    expect(preview.rows[1]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "stock", status: "ignored" });
    expect(preview.rows[2]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "option", optionType: "put", strikePrice: 230, status: "normalized" });
    expect(preview.rows[3]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "stock", status: "ignored" });
  });

  it("ignores multi-contract assignment stock legs described as 'Options Assigned' (plural)", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"2/27/2026","2/27/2026","3/2/2026","IREN","IREN 2/27/2026 Call $35.00","OASGN","2","",""',
      '"2/27/2026","2/27/2026","3/2/2026","IREN","IREN Limited CUSIP: Q4982L109 2 IREN Options Assigned","Sell","200","$35.00","$6,999.96"'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows[0]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "option", optionType: "call", strikePrice: 35, status: "normalized" });
    expect(preview.rows[1]).toMatchObject({ action: "ASSIGNMENT", instrumentType: "stock", status: "ignored" });
  });

  it("normalizes non-trade cash rows without requiring symbols", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"5/4/2026","5/4/2026","5/4/2026","","Aggregated Margin Rate","MINT","","","($59.00)"',
      '"5/1/2026","5/1/2026","5/1/2026","","Brokerage-held Cash Interest Payment","INT","","","$8.13"',
      '"5/1/2026","5/1/2026","5/1/2026","","ACH Deposit","ACH","","","$30,000.00"'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows.map((row) => row.action)).toEqual(["FEE", "DIVIDEND", "TRANSFER"]);
    expect(preview.rows.every((row) => row.instrumentType === "cash")).toBe(true);
    expect(preview.rows.every((row) => row.status === "normalized")).toBe(true);
  });

  it("strips Robinhood report footer disclaimers", () => {
    const csv = [
      '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
      '"6/1/2026","6/1/2026","6/2/2026","MSFT","Microsoft\nCUSIP: 594918104","Buy","2","$450.00","($900.00)"',
      '"The data provided is for informational purposes only. Please consult a professional tax service or professional tax advisor regarding your tax reporting obligations."'
    ].join("\n");
    const preview = parseRobinhoodInput(csv);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ symbol: "MSFT", action: "BUY", status: "normalized" });
    expect(preview.issues).toHaveLength(0);
  });
});
