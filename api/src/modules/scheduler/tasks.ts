import { Schedule } from "./index";
import { syncIdxStockSummaries } from "@services/stock-updater/idx-services";
import { syncTradingviewStockIndustries } from "@services/stock-updater/tradingview-industry-services";
import { syncTradingviewStockSectors } from "@services/stock-updater/tradingview-services";
import { updateNews } from "@services/news/news-updater-service";

export function registerSchedulerTasks(): void {
  // jalankan sekali saat server start
  // void syncIdxStockSummaries();
  void (async () => {
    // await syncTradingviewStockSectors();
    // await syncTradingviewStockIndustries();
    await updateNews();
  })();

  // update berita setiap hari
  Schedule.call(async () => {
    await updateNews();
  }, "update-news")
    .daily()
    .at("08:00")
    .timezone("Asia/Jakarta");

  // Senin-Jumat, jam 09:00-16:59, kecuali 12:00-13:00
  Schedule.call(async () => {
    await syncIdxStockSummaries();
  }, "idx-stock-summary")
    .everyMinute()
    .weekdays()
    .between("09:00", "16:59")
    .unlessBetween("12:00", "12:59")
    .timezone("Asia/Jakarta");

  // update sektor TradingView tiap 30 menit di jam bursa
  Schedule.call(async () => {
    await syncTradingviewStockSectors();
  }, "tradingview-stock-sector")
    .everyThirtyMinutes()
    .weekdays()
    .between("09:00", "16:59")
    .unlessBetween("12:00", "12:59")
    .timezone("Asia/Jakarta");

  // update industri TradingView tiap 30 menit di jam bursa
  Schedule.call(async () => {
    await syncTradingviewStockIndustries();
  }, "tradingview-stock-industry")
    .everyThirtyMinutes()
    .weekdays()
    .between("09:00", "16:59")
    .unlessBetween("12:00", "12:59")
    .timezone("Asia/Jakarta");
}
