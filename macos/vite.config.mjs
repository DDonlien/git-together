import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { accountImportPlugin } from "./server/http-api.ts";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react(), accountImportPlugin({ githubClientId: process.env.GITTOGETHER_GITHUB_CLIENT_ID || loadEnv(mode, process.cwd(), "GITTOGETHER_").GITTOGETHER_GITHUB_CLIENT_ID || "" })],
}));
