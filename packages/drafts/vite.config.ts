import {join} from "node:path"
import {pathToFileURL} from "node:url"
import {defineConfig} from "vite"
import solid from "vite-plugin-solid"
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js"
import {directory as system} from "../../scripts/system.mjs"

// the modules the host's import map provides, from the patchwork-system
// checkout three runs on (alphaville), so drafts shares the host's automerge
// repo 3 rather than bundling its own
const {default: externals} = await import(
	pathToFileURL(join(system, "core", "bootloader", "dist", "externals-list.js")).href
)

export default defineConfig({
	base: "./",
	plugins: [solid(), cssInjectedByJsPlugin({relativeCSSInjection: true})],
	build: {
		outDir: "../../public/packages/drafts/dist",
		sourcemap: true,
		cssCodeSplit: true,
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			external: externals,
			input: "./src/index.ts",
			output: {
				format: "es",
				entryFileNames: "[name].js",
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name][extname]",
			},
			preserveEntrySignatures: "strict",
		},
	},
})
