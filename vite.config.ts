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
      manifest: {
        name: "Angus",
        short_name: "Angus",
        description: "Planificador de obra, ventas y agenda para artistas",
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          /* The same 512 serves as the maskable icon on purpose: the mark
             sits inside the central 80% (the A spans y 118–392 and
             x 112–402 of 512, every extremity within the 205px safe
             circle), so a launcher's circle or squircle mask crops only
             rose background. Declared as a separate entry rather than
             "any maskable" because Chrome treats the combined purpose as
             a hint to crop the `any` rendering too. Source: icon.svg. */
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        /* The precache used to be exactly inverted. It swept in every JS
           chunk — including heic2any (1.3 MiB) and the jsPDF bundle, the
           two things the lazy imports in lib/files.ts and NoteEditor
           exist to keep OFF the critical path — while omitting woff2, so
           the ~130 KiB of self-hosted fonts she actually needs offline
           was the one thing not cached. Both halves fixed: fonts in,
           the on-demand heavyweights out. They still load on first use
           over the network, which is the point of splitting them. */
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/heic2any-*.js", "**/notePdf-*.js"],
        // A chunk larger than the default 2 MiB limit would be silently
        // dropped from the manifest; say so instead.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        /* React and the Supabase client change on their own schedule,
           not hers. Splitting them means a normal app deploy re-downloads
           the app chunk only, instead of ~250 KiB gzip of unchanged
           vendor code. (@aws-sdk is NOT here on purpose — it is an api/
           dependency and never enters the browser bundle.) */
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client"],
          supabase: ["@supabase/supabase-js"]
        }
      }
    }
  },
  server: {
    host: true
  }
});
