# three.patchwork.inkandswitch.com

a patchwork on patchwork-system's `alphaville` branch (automerge-repo 3), with
a reduced set of packages and its own drafts and themes.

```
pnpm install
pnpm dev     # clones and builds patchwork-system@alphaville into .system first
pnpm build
pnpm test
```

- `scripts/system.mjs`: the alphaville checkout everything `@inkandswitch/patchwork`
  comes from. `.system/` by default; set `PATCHWORK_SYSTEM_DIRECTORY` to use
  your own (e.g. `../system`), and `pnpm system:update` to pull alphaville again.
- `public/packages/three-themes`: Light (peach) and Amber (dark).
- `vendor/*.patch`: changes to pkg-base packages for automerge-repo 3, made
  with `scripts/vendor.mjs`, among them `vendor/drafts.patch`, which ports
  pkg-base's drafts. See [docs/automerge-repo-3.md](docs/automerge-repo-3.md).
