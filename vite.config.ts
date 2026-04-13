import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const publicBackendFallback = {
  VITE_SUPABASE_PROJECT_ID: "eidesurdreoxroarympm",
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGVzdXJkcmVveHJvYXJ5bXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTU0MDUsImV4cCI6MjA4Mzk5MTQwNX0.i0wMqLBgp7jzxXg2WjebdDb4y005tV3W6aBb_v9yZGQ",
  VITE_SUPABASE_URL: "https://eidesurdreoxroarympm.supabase.co",
} as const;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicBackendConfig = {
    VITE_SUPABASE_PROJECT_ID: env.VITE_SUPABASE_PROJECT_ID || publicBackendFallback.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      env.VITE_SUPABASE_PUBLISHABLE_KEY || publicBackendFallback.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || publicBackendFallback.VITE_SUPABASE_URL,
  };

  return {
    define: {
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(publicBackendConfig.VITE_SUPABASE_PROJECT_ID),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicBackendConfig.VITE_SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicBackendConfig.VITE_SUPABASE_URL),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: ["pdf-lib", "pako", "react", "react-dom"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "pdf-lib": ["pdf-lib"],
          },
        },
      },
    },
  };
});
