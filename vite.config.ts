import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vite"
import {base, core, environment, patchwork} from "./vite/environment.ts"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [
		environment(),
		patchwork({
			title: "Patchwork",
			description: "local-first collaborative malleable software environment",
			storagePrefix: "three.patchwork.inkandswitch.com",
			server: {fs: {allow: [root, core]}},
			keyhive: process.env.KEYHIVE === "true",
			themeColor: {light: "#c0c0c0", dark: "#000000"},
			html: {
				attributes: {
					"data-theme-light": "three-alto",
					"data-theme-dark": "three-amber",
					// seed only three's own examples (public/init.js), not the tools
					// bundle's, whose tools three doesn't load
					"data-examples": "site",
				},
			},
			icons: {
				source: process.env.PATCHWORK_FAVICON ?? "public/three.svg",
				maskIcon: "public/three-mask.svg",
			},
			static: [
				base
					? {from: join(base, "static-dist"), watch: ".watch-ready"}
					: "@inkandswitch/patchwork-pkg-base",
			],
			// vite's cors middleware adds `Vary: Origin`, which netlify doesn't
			// send; the service worker then caches the crossorigin wasm preloads
			// under that Vary and offline boot misses them. The patchwork plugin
			// already sends `Access-Control-Allow-Origin: *`.
			preview: {cors: false},
			buildInfo: {
				packageListURL: process.env.PATCHWORK_SYSTEM_PACKAGE_LIST_URL,
			},
		}),
	],
})
