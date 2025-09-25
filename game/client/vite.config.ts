import { defineConfig, splitVendorChunkPlugin } from "vite";

export default defineConfig({
  plugins: [splitVendorChunkPlugin()],
  base: "/",
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ["@babylonjs/core", "@babylonjs/materials", "@babylonjs/loaders"],
          net: ["socket.io-client"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
