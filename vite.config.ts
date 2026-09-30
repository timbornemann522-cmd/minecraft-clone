import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // works from any host path (GitHub Pages, proxies, file://)
  assetsInclude: ["**/*.glb"],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
