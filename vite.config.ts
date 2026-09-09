import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// One dev server for everything: Vite serves the Vue app and the Cloudflare
// plugin runs the Worker (API, KV, cron) in workerd alongside it.
export default defineConfig({
	plugins: [vue(), tailwindcss(), cloudflare()],
	server: { port: 8787 },
});
