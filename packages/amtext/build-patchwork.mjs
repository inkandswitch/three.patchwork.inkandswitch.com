// builds the patchwork package (patchwork/main.js) into the site's
// public/packages/amtext. The modules in patchwork's import map stay bare
// imports so the package shares them with everything else; the rest
// (@lezer/*, @codemirror/lint, @codemirror/autocomplete) is bundled in.
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outdir = fileURLToPath(new URL("../../public/packages/amtext/dist", import.meta.url));

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: { main: "patchwork/main.js" },
  absWorkingDir: fileURLToPath(new URL(".", import.meta.url)),
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  external: [
    "@automerge/automerge",
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
    "@codemirror/commands",
    "@inkandswitch/patchwork-plugins",
  ],
});
