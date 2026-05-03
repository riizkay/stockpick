import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "bun";
import InitRoutes from "./src/system/initializer";
import { Schedule } from "./src/modules/scheduler";
import { registerSchedulerTasks } from "./src/modules/scheduler/tasks";

// baca api/.env walaupun `bun run` dipanggil dari folder lain
const apiRoot = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: join(apiRoot, ".env") });

function idleTimeoutSeconds(): number {
  const raw = process.env.IDLE_TIMEOUT_SECONDS;
  if (raw === undefined || raw === "") return 255;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 255;
  if (n <= 0) return 0;
  return Math.min(255, Math.floor(n));
}

(async () => {
  const dynamicRoutes = await InitRoutes();
  const port = Number(process.env.PORT) || 5000;
  registerSchedulerTasks();
  Schedule.start();

  serve({
    port,
    // default Bun 10s — bikin SSE/stream putus; max 255s, 0 = tanpa timeout
    idleTimeout: idleTimeoutSeconds(),
    routes: {
      "/": {
        GET: () => Response.json({
          success: true,
          data: {
            name: "stock-agent-api",
            status: "ok",
          },
        }),
      },
      ...dynamicRoutes,
    },
  });

  console.log(`API Stock Agent jalan di port ${port}`);
  console.log(`[scheduler] aktif dengan ${Schedule.getTaskCount()} task`);
})();
