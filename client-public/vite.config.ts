import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const portApi = env.PORT_API ?? "5000";

  return {
    plugins: [tailwindcss(), react()],
    server: {
      host: true,
      proxy: {
        "/api": {
          target: `http://localhost:${portApi}`,
          changeOrigin: true,
        },
      },
    },
  };
});
