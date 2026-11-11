import * as A from "@automerge/automerge";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify, Counter, Cursor, ImmutableString, Link } from "./amtext.js";
import { patchworkFolder, zip, unzip, ROOT } from "./patchworkfolder.js";

// ---- parser on the example from the request
const example = `{
  @patchwork {
    type = "whatever"
  }
  x counter(1)
  y \`long
string\`
  z string("hehe")
  whatever bytes(1, 2, 3, 4)
  file link("./other.amtxt")
  "with space" 132
  items [ 1, 2, 3 ]
  other [
    1,
     2, 3
  ]
}`;
const ex = parse(example);
assert.equal(ex["@patchwork"].type, "whatever");
assert.ok(ex.x instanceof Counter && ex.x.value === 1);
assert.equal(ex.y, "long\nstring");
assert.ok(ex.z instanceof ImmutableString && ex.z.value === "hehe");
assert.deepEqual([...ex.whatever], [1, 2, 3, 4]);
assert.ok(ex.file instanceof Link && ex.file.path === "./other.amtxt");
assert.equal(ex["with space"], 132);
assert.deepEqual(ex.other, [1, 2, 3]);

// ---- stringify/parse round trip with awkward values
const tricky = {
  fence: "has ` and `` inside\nline2",
  startsTick: "`\nx",
  cr: "a\r\nb",
  esc: 'quote " back \\ tab\t',
  big: new Uint8Array(200).map((_, i) => i),
  when: new Date("2026-10-30T12:00:00Z"),
  neg: -3.5e-7,
  nested: { "__proto__x": [ { a: [] }, {} ], "1": null },
  t: true,
};
const back = parse(stringify(tricky));
assert.deepEqual(back, JSON.parse(JSON.stringify(tricky, (k, v) => v)) && back);
for (const k of ["fence", "startsTick", "cr", "esc", "neg", "t"]) assert.deepEqual(back[k], tricky[k], k);
assert.deepEqual([...back.big], [...tricky.big]);
assert.equal(back.when.getTime(), tricky.when.getTime());
assert.deepEqual(back.nested, tricky.nested);

// errors carry positions
assert.throws(() => parse("{\n  a counter(1.5)\n}"), /line 2/);
assert.throws(() => parse("{ a 1 a 2 }"), /duplicate/);
assert.throws(() => parse("{ a nope }"), /unexpected word/);

// ---- fake automerge-repo 3 + fake patchwork plugins mirroring createDocOfDatatype2.
// Like ar3: create() resolves later, and change() mutates at once but returns a
// promise that settles when the change is "stored" (rejecting if saves fail).
const later = v => new Promise(r => setTimeout(() => r(v)));
class Handle {
  constructor(url, repo) { this.url = url; this.repo = repo; this.d = A.init(); }
  doc() { return this.d; }
  change(fn) {
    this.d = A.change(this.d, fn);
    return this.repo.failSaves ? Promise.reject(new Error("save failed")) : later();
  }
}
function fakeRepo() {
  const handles = new Map();
  return {
    handles,
    failSaves: false,
    create() { const h = new Handle(`automerge:${randId()}`, this); handles.set(h.url, h); return later(h); },
    async find(url) { const h = handles.get(url.split("#")[0]); if (!h) throw new Error("unavailable"); return h; },
  };
}
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const randId = () => Array.from({ length: 28 }, () => B58[Math.floor(Math.random() * 58)]).join("");
const datatypes = {
  folder: { id: "folder", importUrl: "automerge:FOLDERTOOL#abc", module: { init(d) { d.title = "Untitled"; d.docs = []; d.junk = 1; } } },
  essay: { id: "essay", module: { init(d) { d.content = ""; } } },
};
const plugins = {
  getRegistry: () => ({ load: async id => datatypes[id] }),
  async createDocOfDatatype2(dt, repo, change) {
    const h = await repo.create();
    await h.change(d => { dt.module.init(d, repo); d["@patchwork"] = { type: dt.id, suggestedImportUrl: "automerge:FOLDERTOOL" }; change?.(d); });
    return h;
  },
};

// ---- build a source tree: folder -> [essay, subfolder -> [essay(again, cycle), unknown-type doc]], plus a dead link
const src = fakeRepo();
const mk = async (pw, body) => { const h = await src.create(); await h.change(d => { if (pw) d["@patchwork"] = pw; Object.assign(d, body); }); return h; };
const essay = await mk({ type: "essay", suggestedImportUrl: "automerge:SHOULDNOTFOLLOW", mainDraftUrl: "automerge:3DRAFTDRAFTDRAFTDRAFTDRAFTDRA" }, {
  content: "# hi\nsee automerge:EMBEDDED in text",
  views: new A.Counter(7),
  slug: new A.ImmutableString("hi"),
  thumb: new Uint8Array([9, 8, 7]),
  at: new Date(0),
});
const linked = await mk({ type: "essay" }, { content: "only reachable from a link mark" });
const richSpec = [
  { type: "block", value: { type: new A.ImmutableString("heading"), parents: [], attrs: { level: 1 } } },
  { type: "text", value: "Hello, " },
  { type: "text", value: "world", marks: { bold: true } },
  { type: "block", value: { type: new A.ImmutableString("paragraph"), parents: [new A.ImmutableString("blockquote")], attrs: {} } },
  { type: "text", value: "see `this`\nok", marks: { link: linked.url, bold: true } },
];
essay.change(d => {
  d.body = "";
  A.updateSpans(d, ["body"], richSpec);
  d.notes = ["plain", "marked"];
  A.mark(d, ["notes", 1], { start: 0, end: 3, expand: "after" }, "em", true);
});
const odd = await mk({ type: "mystery", mainDraftUrl: "automerge:3DRAFTDRAFTDRAFTDRAFTDRAFTDRA" }, { x: 1 });
// comments: a range of the essay's text, the whole essay, and a range of the odd doc's text
const contact = await mk(undefined, { name: "someone" });
odd.change(d => { d.text = "odd text"; });
const at = (h, path, n) => A.getCursor(h.doc(), path, n);
const thread = (id, ref) => ({
  "@patchwork": { type: "comment-thread" }, id, isResolved: false, refs: [ref],
  comments: [{ id: `${id}-c`, contactUrl: contact.url, timestamp: 1, content: "ok" }],
});
essay.change(d => {
  d["@comments"] = { threads: [
    thread("t1", `${essay.url}/content/[${at(essay, ["content"], 2)}-${at(essay, ["content"], 4)}]#deadbeef`),
    thread("t2", essay.url),
    thread("t3", `${odd.url}/text/[${at(odd, ["text"], 8)}]`),
  ] };
  // a part of a doc that isn't text, found by matching a list item
  d.lastThread = `${essay.url}/%5C%40comments/threads/${encodeURIComponent(JSON.stringify({ id: "t2" }))}/comments/@0`;
  d.badCursor = `${essay.url}/content/[9@abcdef-10@abcdef]`;
});
const sub = await mk({ type: "folder" }, { title: "sub", docs: [] });
const top = await mk({ type: "folder" }, { title: "My / Folder", docs: [] });
sub.change(d => { d.docs.push({ name: "essay again", type: "essay", url: essay.url }, { name: "odd", type: "mystery", url: odd.url }, { name: "parent", type: "folder", url: top.url }); });
top.change(d => { d.docs.push({ name: "essay", type: "essay", url: essay.url + "#deadbeef" }, { name: "sub", type: "folder", url: sub.url }, { name: "gone", type: "essay", url: "automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu" }); });

const pf1 = patchworkFolder({ repo: src, Automerge: A, plugins });
const origWarn = console.warn; const warnings = []; console.warn = (...a) => warnings.push(a.join(" "));
const { bytes, filename, count, failed } = await pf1.exportFolder(top.url);
console.warn = origWarn;
assert.equal(count, 5);
assert.deepEqual(failed, ["automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu"]);
assert.equal(filename, "My - Folder.patchworkfolder");

// archive is a real zip
const dir = mkdtempSync(join(tmpdir(), "pf-"));
writeFileSync(join(dir, filename), bytes);
execFileSync("unzip", ["-tq", join(dir, filename)]);
const listing = execFileSync("unzip", ["-Z1", join(dir, filename)]).toString().trim().split("\n");
assert.equal(listing[0], ROOT);
assert.ok(listing.slice(1).every(n => /^[0-9a-f-]{36}\.amtext$/.test(n)));
const entries = await unzip(bytes);
const rootText = new TextDecoder().decode(entries.get(ROOT));
console.log("---- root.amtext\n" + rootText);
const essayName = [...entries].find(([, b]) => new TextDecoder().decode(b).includes("views"))[0];
const essayText = new TextDecoder().decode(entries.get(essayName));
console.log(`---- ${essayName}\n` + essayText);
assert.ok(![...entries.values()].some(b => new TextDecoder().decode(b).includes("mainDraftUrl")), "mainDraftUrl left out");
assert.ok(essayText.includes(`link("./${essayName}", "content", cursor(2, 4))`), "range ref is a link to positions");
assert.ok(essayText.includes(`refs [ link("./${essayName}") ]`), "doc-level ref is a link");
assert.match(essayText, /link\("\.\/[0-9a-f-]{36}\.amtext", "text", cursor\(8\)\)/, "ref to another doc's text");
assert.ok(essayText.includes(`link("./${essayName}", "@comments", "threads", { id "t2" }, "comments", 0)`), "path with a match");
assert.ok(essayText.includes(`contactUrl "${contact.url}"`), "contactUrl stays the contact's");
assert.ok(essayText.includes(`badCursor "${essay.url}/content/[9@abcdef-10@abcdef]"`), "unresolvable cursors kept as they were");

// ---- import into a fresh repo
const dst = fakeRepo();
const pf2 = patchworkFolder({ repo: dst, Automerge: A, plugins });
console.warn = (...a) => warnings.push(a.join(" "));
const { root, urls } = await pf2.importFolder(bytes);
console.warn = origWarn;
assert.equal(urls.size, 5);
const get = url => dst.handles.get(url).doc();
const nTop = get(root);
assert.equal(nTop.title, "My / Folder");
assert.equal(nTop.junk, undefined, "init-only keys removed");
assert.deepEqual(nTop["@patchwork"], { type: "folder", suggestedImportUrl: "automerge:FOLDERTOOL" }, "@patchwork from createDocOfDatatype2");
assert.equal(nTop.docs[2].url, "automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu", "dead link left as string");
const nEssay = get(nTop.docs[0].url);
assert.ok(dst.handles.has(nTop.docs[0].url), "heads dropped, points at new doc");
assert.ok(nEssay.views instanceof A.Counter && nEssay.views.value === 7);
assert.ok(nEssay.slug instanceof A.ImmutableString && nEssay.slug.val === "hi");
assert.deepEqual([...nEssay.thumb], [9, 8, 7]);
assert.equal(nEssay.at.getTime(), 0);
assert.equal(nEssay.content, "# hi\nsee automerge:EMBEDDED in text");
const nSub = get(nTop.docs[1].url);
assert.equal(nSub.docs[0].url, nTop.docs[0].url, "shared doc cloned once");
assert.equal(nSub.docs[2].url, root, "cycle back to root");
const nOdd = get(nSub.docs[1].url);
assert.deepEqual(nOdd["@patchwork"], { type: "mystery" }, "unknown type: @patchwork copied from file");
assert.ok(warnings.some(w => w.includes('no datatype "mystery"')));
// comments
const nEssayDoc = get(nTop.docs[0].url);
const [t1, t2, t3] = nEssayDoc["@comments"].threads;
const range = /^(automerge:\w+)\/content\/\[([^\]-]+)-([^\]]+)\]$/.exec(t1.refs[0]);
assert.ok(range, t1.refs[0]);
assert.equal(range[1], nTop.docs[0].url, "range ref points at the new essay");
assert.deepEqual(range.slice(2).map(c => A.getCursorPosition(nEssayDoc, ["content"], c)), [2, 4], "cursors are made again");
assert.equal(t2.refs[0], nTop.docs[0].url, "doc-level ref is the new essay");
assert.equal(t3.refs[0], `${nSub.docs[1].url}/text/[e]`, "ref into the other doc's text");
assert.equal(t1.comments[0].contactUrl, contact.url, "contactUrl stays the contact's");
assert.ok(!dst.handles.has(contact.url) && urls.size === 5, "contact not brought along");
assert.equal(nEssayDoc.lastThread, `${nTop.docs[0].url}/%5C%40comments/threads/${encodeURIComponent(JSON.stringify({ id: "t2" }))}/comments/@0`);
assert.equal(nEssayDoc.badCursor, `${essay.url}/content/[9@abcdef-10@abcdef]`);
// hand-written: no text to put cursors in
console.warn = (...a) => warnings.push(a.join(" "));
const noText = await pf2.importFolder(await zip([{ name: ROOT, data: new TextEncoder().encode('{ n 1, r link("./root.amtext", "n", cursor(0)) }') }]));
console.warn = origWarn;
assert.equal(get(noText.root).r, `${noText.root}/n`, "cursors left off when there's no text");
// rich text
const norm = (spans, from, to) => JSON.parse(JSON.stringify(spans).replaceAll(from, to));
const nEssayUrl = nTop.docs[0].url;
const nSpans = A.spans(dst.handles.get(nEssayUrl).doc(), ["body"]);
const nLinked = nSpans[4].marks.link;
assert.notEqual(nLinked, linked.url);
assert.equal(get(nLinked).content, "only reachable from a link mark", "doc linked only from a mark got cloned");
assert.deepEqual(norm(nSpans, nLinked, "L"), norm(A.spans(essay.doc(), ["body"]), linked.url, "L"));
assert.ok(nSpans[0].value.type instanceof A.ImmutableString, "block type stays ImmutableString");
assert.equal(nEssay.notes[0], "plain");
assert.deepEqual(A.spans(get(nEssayUrl), ["notes", 1]), A.spans(essay.doc(), ["notes", 1]));
// hand-written richtext
const hand = parse(`{ c richtext(
  block({ type string("p") })
  "a" text("b", { bold true, href link("./x.amtext") }) \`c
d\`
) }`);
assert.equal(hand.c.spans.length, 4);
assert.ok(hand.c.spans[2].marks.href instanceof Link);
assert.throws(() => parse("{ a text(\"x\") }"), /only goes inside richtext/);
assert.throws(() => parse("{ a richtext(1) }"), /richtext\(\) takes/);
assert.throws(() => parse('{ a richtext(text("x", { m [1] })) }'), /mark "m"/);
// counters still work as counters
await dst.handles.get(nTop.docs[0].url).change(d => d.views.increment(2));
assert.equal(get(nTop.docs[0].url).views.value, 9);

// ---- archive zipped by Info-ZIP inside a top dir, with junk
const work = join(dir, "x"); execFileSync("mkdir", ["-p", join(work, "Folder"), join(work, "__MACOSX")]);
for (const [n, b] of entries) writeFileSync(join(work, "Folder", n), b);
writeFileSync(join(work, "__MACOSX", "._root.amtext"), "junk");
execFileSync("zip", ["-qr", "../re.zip", "Folder", "__MACOSX"], { cwd: work });
const re = await pf2.importFolder(new Uint8Array(readFileSync(join(dir, "re.zip"))));
assert.equal(get(re.root).title, "My / Folder");

// ---- single doc text
const t = await pf1.exportDocText(essay.url);
const u = await pf2.importDocText(t);
assert.equal(get(u).content, nEssay.content);
await assert.rejects(pf2.importDocText('{ a link("./x.amtext") }'), /archive/);

// a change that can't be stored fails the import instead of being dropped
dst.failSaves = true;
await assert.rejects(pf2.importDocText(t), /save failed/);
await assert.rejects(pf2.importFolder(bytes), /save failed/);
dst.failSaves = false;

// zip of empty + binary-ish
const z = await zip([{ name: "a", data: new Uint8Array() }, { name: "ü/b", data: new Uint8Array(5000) }]);
const uz = await unzip(z);
assert.equal(uz.get("a").length, 0); assert.equal(uz.get("ü/b").length, 5000);

console.log("ok");
