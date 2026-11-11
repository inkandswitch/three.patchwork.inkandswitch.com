// Makes the vendor/<name>.patch files: three's changes to pkg-base packages
// for automerge-repo 3. Each package is fetched at the commit below into
// .vendor/<name> (a git repo, with that commit as its first commit, and its
// patch applied if there is one); edit it there and save the diff.
//
//   node scripts/vendor.mjs fetch <name>  fetch .vendor/<name>, with its patch
//   node scripts/vendor.mjs save <name>   write .vendor/<name>'s changes to
//                                         vendor/<name>.patch
//   node scripts/vendor.mjs check         check every patch applies cleanly
import {spawnSync} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"
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
const patchFile = name => join(root, "vendor", `${name}.patch`)

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

function apply(name) {
	const patch = patchFile(name)
	if (!existsSync(patch)) return
	run("git", ["apply", "--whitespace=nowarn", patch], sourceDir(name))
}

const [command, name] = process.argv.slice(2)
if (command === "fetch" || command === "save") {
	if (!(name in packages)) throw new Error(`no vendored package "${name}"`)
}
if (command === "fetch") {
	await fetchSource(name, packages[name], sourceDir(name))
	apply(name)
} else if (command === "save") {
	writeFileSync(patchFile(name), changes(sourceDir(name)))
	console.log(`vendor: wrote vendor/${name}.patch`)
} else if (command === "check") {
	for (const name of Object.keys(packages)) {
		const dir = sourceDir(name)
		if (!existsSync(join(dir, ".git"))) await fetchSource(name, packages[name], dir)
		run("git", ["stash", "--quiet", "--include-untracked"], dir)
		run("git", ["apply", "--check", patchFile(name)], dir)
		run("git", ["stash", "pop", "--quiet"], dir)
		console.log(`vendor: ${name}.patch applies`)
	}
} else {
	throw new Error("usage: node scripts/vendor.mjs fetch|save <name>, or check")
}
