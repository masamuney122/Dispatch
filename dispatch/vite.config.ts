import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const target = mode === "desktop" ? "desktop" : "web";

  return {
    base: target === "web" ? process.env.VITE_BASE_PATH || "/" : "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@platform": fileURLToPath(
          new URL(`./src/platform/${target}/services`, import.meta.url),
        ),
      },
    },
    build: {
      outDir: `dist/${target}`,
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
