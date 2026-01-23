import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  server: {
    host: "0.0.0.0",
    port: 8083,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    target: ["chrome87", "firefox78", "safari12", "edge88"],
  },
});
