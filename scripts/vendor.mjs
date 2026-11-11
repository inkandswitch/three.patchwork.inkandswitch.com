// three's changes to pkg-base packages for automerge-repo 3, as
// vendor/<name>.patch, and the packages built from them. A build fetches each
// package at the commit below into .vendor/build/<name>, applies its patch,
// installs it from its own lockfile, builds it, and copies its package.json,
// dist/ and example.js into public/packages/<name>/, where it takes the place
// of pkg-base's copy. A package whose commit and patch haven't changed since
// its last build is left alone.
//
// To change a patch, fetch the package into .vendor/<name> (a git repo, with
// that commit as its first commit, and its patch applied), edit it there, and
// save the diff. Builds never touch .vendor/<name>.
//
//   node scripts/vendor.mjs               build what has changed
//   node scripts/vendor.mjs fetch <name>  fetch .vendor/<name>, with its patch
//   node scripts/vendor.mjs save <name>   write .vendor/<name>'s changes to
//                                         vendor/<name>.patch
//   node scripts/vendor.mjs check         check every patch applies cleanly
import {spawnSync} from "node:child_process"
import {createHash} from "node:crypto"
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = "inkandswitch/patchwork-pkg-base"

// main: "update to latest solid-automerge"
const base = "7f45a2b67dc70b589523bc742020371be3551a3f"

// what each patch changes is in the report, docs/automerge-repo-3.md
const packages = {
	providers: base,
	account: base,
	threepane: base,
	"codemirror-markdown": base,
	sideboard: base,
	"sync-indicator": base,
	"comments-view": base,
	"codemirror-base": base,
	"doc-presence": base,
}

// a commit needs someone to have made it, and a build machine has no one
const git = ["-c", "user.name=three", "-c", "user.email=three@localhost", "-c", "core.autocrlf=false"]

function run(command, args, cwd, options = {}) {
	const result = spawnSync(command, args, {cwd, stdio: "inherit", ...options})
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`)
	}
	return result.stdout
}

const sourceDir = name => join(root, ".vendor", name)
const buildDir = name => join(root, ".vendor", "build", name)
const patchFile = name => join(root, "vendor", `${name}.patch`)
const outDir = name => join(root, "public", "packages", name)
// what public/packages/<name> was last built from
const stampFile = name => join(root, ".vendor", "build", `${name}.json`)
const readPatch = name => (existsSync(patchFile(name)) ? readFileSync(patchFile(name), "utf8") : "")
const hash = text => createHash("sha256").update(text).digest("hex")

// what's copied from a package into the site, as pkg-base's own static tree
// has it: a built package ships its package.json and dist/ (and example.js,
// the example it seeds a new account with); a bundleless one, its top-level
// modules and styles
function shipped(dir) {
	const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
	if (manifest.scripts?.build) return ["package.json", "dist", "example.js"]
	return readdirSync(dir).filter(
		file => file === "package.json" || (/\.(js|css)$/.test(file) && !/\.test\.js$/.test(file))
	)
}

// everything in .vendor/<name> that differs from the commit it was fetched at
function changes(dir) {
	run("git", ["add", "--intent-to-add", "--all"], dir)
	return run("git", ["diff", "--binary", "HEAD"], dir, {stdio: ["ignore", "pipe", "inherit"], encoding: "utf8"})
}

async function fetchSource(name, commit, dir) {
	console.log(`vendor: fetching ${name} at ${commit.slice(0, 7)}`)
	const response = await fetch(`https://codeload.github.com/${repo}/tar.gz/${commit}`)
	if (!response.ok) throw new Error(`couldn't fetch ${repo}@${commit}: ${response.status}`)
	rmSync(dir, {recursive: true, force: true})
	mkdirSync(dir, {recursive: true})
	const tarball = `${dir}.tar.gz`
	writeFileSync(tarball, Buffer.from(await response.arrayBuffer()))
	try {
		run("tar", ["-xzf", tarball, "-C", dir, "--strip-components=2", `patchwork-pkg-base-${commit}/${name}`], root)
	} finally {
		rmSync(tarball)
	}
	run("git", ["init", "--quiet"], dir)
	// not every package has its own .gitignore (base's is at its root)
	writeFileSync(join(dir, ".git", "info", "exclude"), "/dist/\n/node_modules/\n")
	run("git", ["add", "--all"], dir)
	run("git", [...git, "commit", "--quiet", "--no-verify", "-m", `${repo}@${commit}`], dir)
}

function apply(name, dir = sourceDir(name)) {
	const patch = patchFile(name)
	if (!existsSync(patch)) return
	run("git", ["apply", "--whitespace=nowarn", patch], dir)
}

async function build(name) {
	const commit = packages[name]
	const stamp = {commit, patch: hash(readPatch(name))}
	const last = existsSync(stampFile(name)) ? JSON.parse(readFileSync(stampFile(name), "utf8")) : null
	const out = outDir(name)
	if (last?.commit === stamp.commit && last?.patch === stamp.patch && existsSync(join(out, "dist"))) return

	const dir = buildDir(name)
	await fetchSource(name, commit, dir)
	apply(name, dir)
	console.log(`vendor: building ${name}`)
	const files = shipped(dir)
	if (files.includes("dist")) {
		run("pnpm", ["install", "--frozen-lockfile"], dir)
		run("pnpm", ["run", "build"], dir)
	}
	rmSync(out, {recursive: true, force: true})
	mkdirSync(out, {recursive: true})
	for (const file of files) {
		if (existsSync(join(dir, file))) cpSync(join(dir, file), join(out, file), {recursive: true})
	}
	writeFileSync(stampFile(name), JSON.stringify(stamp))
}

const [command, name] = process.argv.slice(2)
if (command === "fetch" || command === "save") {
	if (!(name in packages)) throw new Error(`no vendored package "${name}"`)
}
if (!command) {
	for (const name of Object.keys(packages)) await build(name)
} else if (command === "fetch") {
	await fetchSource(name, packages[name], sourceDir(name))
	apply(name)
	run("pnpm", ["install", "--frozen-lockfile"], sourceDir(name))
} else if (command === "save") {
	writeFileSync(patchFile(name), changes(sourceDir(name)))
	console.log(`vendor: wrote vendor/${name}.patch`)
} else if (command === "check") {
	// each patch against a clean copy of the commit it was made on, so the
	// edits in progress in .vendor/<name> don't count
	for (const name of Object.keys(packages)) {
		const dir = sourceDir(name)
		if (!existsSync(join(dir, ".git"))) await fetchSource(name, packages[name], dir)
		const clean = mkdtempSync(join(tmpdir(), `three-vendor-${name}-`))
		try {
			run("sh", ["-c", `git -C "${dir}" archive HEAD | tar -x -C "${clean}"`], root)
			run("git", ["apply", "--check", patchFile(name)], clean)
		} finally {
			rmSync(clean, {recursive: true, force: true})
		}
		console.log(`vendor: ${name}.patch applies`)
	}
} else {
	throw new Error("usage: node scripts/vendor.mjs [fetch|save <name> | check]")
}
