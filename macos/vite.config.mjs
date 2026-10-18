import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => ({
  base: "./",
  build: {
    outDir: "dist/client", target: "esnext",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  plugins: [react()],
}));
