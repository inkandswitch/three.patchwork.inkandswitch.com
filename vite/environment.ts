import type {Plugin} from "vite"
import {existsSync} from "node:fs"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
// @ts-expect-error: a plain node script
import {directory} from "../scripts/system.mjs"

/**
 * three runs on patchwork-system's alphaville branch, which isn't published:
 * everything `@inkandswitch/patchwork` comes from a checkout of it. That's
 * .system/ (cloned and built by scripts/system.mjs) unless
 * PATCHWORK_SYSTEM_DIRECTORY points somewhere else.
 */
export const core: string = directory

const pkgBaseDirectory =
	process.env.PATCHWORK_PKG_BASE_DIRECTORY ?? process.env.PATCHWORK_BASE_DIR
export const base = pkgBaseDirectory ? resolve(pkgBaseDirectory) : undefined

const dist = join(core, "core", "patchwork", "dist")
if (!existsSync(join(dist, "vite", "patchwork-plugin.js"))) {
	throw new Error(
		`no built patchwork-system at ${core}: run \`node scripts/system.mjs\` first`
	)
}

export const {default: patchwork} = await import(
	pathToFileURL(join(dist, "vite", "patchwork-plugin.js")).href
)

/**
 * Points the site's imports of `@inkandswitch/patchwork` at the checkout's
 * build. In dev the patchwork plugin is already the checkout's own, so the
 * stylesheets it serves are the checkout's too; these aliases are what the
 * site's own source needs.
 */
export function environment(): Plugin {
	return {
		name: "patchwork-environment",
		config() {
			return {
				resolve: {
					alias: [
						{
							find: /^@inkandswitch\/patchwork$/,
							replacement: join(dist, "index.js"),
						},
						{
							find: /^@inkandswitch\/patchwork\/global\.css$/,
							replacement: join(dist, "global.css"),
						},
					],
				},
			}
		},
	}
}
