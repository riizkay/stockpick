import { db } from "@database";
import { SuccessResponse } from "@helper/Response";

export const endpoint = "/api/public/stocks/top-trade-value";

export default {
  GET: async () => {
    const rows = await db
      .selectFrom("stocks")
      .select(["stock_code", "stock_name", "close_price", "change_price", "percentage", "trade_value"])
      .orderBy("trade_value", "desc")
      .limit(20)
      .execute();

    const result = rows.map((row) => ({
      ticker: row.stock_code,
      name: row.stock_name,
      closePrice: row.close_price ?? 0,
      changePrice: row.change_price ?? 0,
      percentage: row.percentage ?? 0,
      tradeValue: row.trade_value ?? 0,
      isUp: (row.percentage ?? 0) >= 0,
    }));

    return SuccessResponse(result);
  },
};
