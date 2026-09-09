import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// One dev server for everything: Vite serves the Vue app and the Cloudflare
// plugin runs the Worker (API, KV, cron) in workerd alongside it.
// Baked into the Worker so each deployment computes a fresh document instead
// of serving what the previous build cached in KV.
const buildId = (process.env.GITHUB_SHA ?? "").slice(0, 7) || `local-${Date.now().toString(36)}`;

export default defineConfig({
	plugins: [vue(), tailwindcss(), cloudflare()],
	define: { __BUILD_ID__: JSON.stringify(buildId) },
	server: { port: 8787 },
});
