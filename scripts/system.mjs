// three runs on patchwork-system's alphaville branch (automerge-repo 3), which
// isn't on npm. This puts a built checkout of it where vite/environment.ts
// looks for one:
//
//   - PATCHWORK_SYSTEM_DIRECTORY, if it's set: a checkout you look after
//     yourself (e.g. ../system). It's built if it hasn't been, never fetched.
//   - otherwise .system/, a clone of PATCHWORK_SYSTEM_REF (default alphaville)
//     made the first time and left alone after that.
//
//   node scripts/system.mjs          clone and build what's missing
//   node scripts/system.mjs update   fetch the ref again into .system, rebuild
//   node scripts/system.mjs path     print the checkout's path
import {spawnSync} from "node:child_process"
import {existsSync, readFileSync, writeFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = "https://github.com/inkandswitch/patchwork-system.git"
const ref = process.env.PATCHWORK_SYSTEM_REF ?? "alphaville"
const own = !(process.env.PATCHWORK_SYSTEM_DIRECTORY ?? process.env.PATCHWORK_CORE_DIR)

export const directory = own
	? join(root, ".system")
	: resolve(process.env.PATCHWORK_SYSTEM_DIRECTORY ?? process.env.PATCHWORK_CORE_DIR)

const plugin = join(directory, "core", "patchwork", "dist", "vite", "patchwork-plugin.js")
// the commit .system was last built at
const stamp = join(root, ".system.json")

function run(command, args, cwd, options = {}) {
	const result = spawnSync(command, args, {cwd, stdio: "inherit", ...options})
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`)
	}
	return result.stdout
}

const head = () =>
	run("git", ["rev-parse", "HEAD"], directory, {
		stdio: ["ignore", "pipe", "inherit"],
		encoding: "utf8",
	}).trim()

function fetchRef() {
	if (!existsSync(join(directory, ".git"))) {
		console.log(`system: cloning patchwork-system@${ref} into .system`)
		run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, repo, directory], root)
		return
	}
	console.log(`system: fetching patchwork-system@${ref}`)
	run("git", ["fetch", "--quiet", "--depth", "1", "origin", ref], directory)
	run("git", ["checkout", "--quiet", "--force", "FETCH_HEAD"], directory)
}

function build() {
	console.log(`system: building ${own ? ".system" : directory}`)
	// the checkout is its own pnpm workspace, so it brings its own lockfile,
	// catalog and patches; three only borrows what it builds
	run("pnpm", ["install", "--frozen-lockfile"], directory)
	run("pnpm", ["--filter", "@inkandswitch/patchwork...", "build"], directory)
	if (own) writeFileSync(stamp, JSON.stringify({ref, commit: head()}))
}

const built = () =>
	existsSync(plugin) &&
	(!own ||
		(existsSync(stamp) && JSON.parse(readFileSync(stamp, "utf8")).commit === head()))

export function ensure({update = false} = {}) {
	if (own && (update || !existsSync(join(directory, ".git")))) fetchRef()
	if (!existsSync(directory)) {
		throw new Error(`PATCHWORK_SYSTEM_DIRECTORY ${directory} doesn't exist`)
	}
	if (update || !built()) build()
	return directory
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [command] = process.argv.slice(2)
	if (command === "path") console.log(directory)
	else if (command === "update") ensure({update: true})
	else if (!command) ensure()
	else throw new Error(`unknown command "${command}"`)
}
