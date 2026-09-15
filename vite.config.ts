import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

const emptyModule = fileURLToPath(new URL("./src/lib/emptyModule.ts", import.meta.url));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    // jsPDF's optional peers (doc.html / SVG) are never used by the note export.
    alias: { html2canvas: emptyModule, canvg: emptyModule, dompurify: emptyModule }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Angus",
        short_name: "Angus",
        description: "Planificador de proyectos, ventas y agenda para artistas",
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      }
    })
  ],
  server: {
    host: true
  }
});
