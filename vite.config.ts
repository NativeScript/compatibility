import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
	root: "web",
	plugins: [vue(), tailwindcss()],
	build: { outDir: "../dist/web", emptyOutDir: true },
	server: {
		// `npm run dev:api` serves the Worker; the page talks to it through this proxy.
		proxy: { "/v1": "http://localhost:8787" },
	},
	test: {
		root: ".",
		include: ["test/**/*.test.ts"],
	},
});
