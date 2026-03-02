import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: "localhost",
    port: 3000,
    strictPort: true
  },
  preview: {
    https: true,
    host: "localhost",
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, "src/taskpane/taskpane.html"),
        commands: resolve(__dirname, "src/commands/commands.html")
      }
    }
  }
});
