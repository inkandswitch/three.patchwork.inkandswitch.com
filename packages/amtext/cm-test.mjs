import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { syntaxTree, ensureSyntaxTree, foldable } from "@codemirror/language";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { amtext, amtextLanguage, lintAmtext } from "./codemirror/index.js";

const sample = `// header comment
{
  @patchwork {
    type = "whatever"
  }
  x counter(1)
  y \`long
string\`
  q \`\`with \` tick\`\`
  z string("hehe")
  whatever bytes(1, 2, 3, 4)
  file link("./other.amtext")
  "with space" 132
  true false
  n -1.5e3
  items [ 1, 2, 3 ]
  body richtext(
    block({ type string("heading"), parents [], attrs { level 1 } })
    "Hello, "
    text("world", { bold true, href null })
  )
}
`;

const tree = amtextLanguage.parser.parse(sample);
let errors = 0;
tree.iterate({ enter: n => { if (n.type.isError) errors++; } });
assert.equal(errors, 0, tree.toString());

// highlighting: collect class per token text
const hl = tagHighlighter([
  { tag: t.propertyName, class: "prop" }, { tag: t.meta, class: "meta" },
  { tag: t.function(t.variableName), class: "fn" }, { tag: t.string, class: "str" },
  { tag: t.special(t.string), class: "fence" }, { tag: t.number, class: "num" },
  { tag: t.bool, class: "bool" }, { tag: t.null, class: "null" }, { tag: t.lineComment, class: "comment" },
]);
const seen = {};
highlightTree(tree, hl, (from, to, cls) => { seen[sample.slice(from, to)] ??= cls; });
assert.equal(seen["@patchwork"], "meta");
assert.equal(seen["type"], "prop");
assert.equal(seen['"with space"'], "prop");
assert.equal(seen["true"], "prop", "keyword in key position is a key");
assert.equal(seen["false"], "bool");
assert.equal(seen["counter"], "fn");
assert.equal(seen["richtext"], "fn");
assert.equal(seen["`long\nstring`"], "fence");
assert.equal(seen["``with ` tick``"], "fence");
assert.equal(seen["-1.5e3"], "num");
assert.equal(seen["null"], "null");
assert.equal(seen["// header comment"], "comment");

// folding + language support wiring
const state = EditorState.create({ doc: sample, extensions: [amtext()] });
ensureSyntaxTree(state, state.doc.length);
const line3 = state.doc.line(3);
assert.ok(foldable(state, line3.from, line3.to), "@patchwork map folds");

// lint
assert.deepEqual(lintAmtext(sample), []);
const bad = '{\n  a 1\n  a counter(1.5)\n}';
const [d] = lintAmtext(bad);
assert.equal(bad.slice(d.from, d.to), "a");
assert.match(d.message, /duplicate/);
const [d2] = lintAmtext('{ x frob(1) }');
assert.equal('{ x frob(1) }'.slice(d2.from, d2.to), "frob");

// recovers from errors without throwing
amtextLanguage.parser.parse("{ a [ 1, \n b ");
console.log("cm ok");

// everything stringify emits parses cleanly in the grammar
import { stringify, parse as amParse, Counter, ImmutableString, Link, RichText } from "./amtext.js";
const emitted = stringify({
  "@patchwork": { type: "x" }, "a b": [ {}, [], { c: new Counter(-2) } ], f: "x\n``y`", d: new Date(5),
  big: new Uint8Array(100), im: new ImmutableString("q\nr"), l: new Link("./a.amtext"),
  r: new RichText([{ type: "block", value: { type: new ImmutableString("p"), attrs: { n: [1, { m: null }] } } },
    { type: "text", value: "a`\nb", marks: { link: new Link("./b.amtext"), at: new Date(0) } }, { type: "text", value: "c" }]),
  e: new RichText([]),
});
const t2 = amtextLanguage.parser.parse(emitted);
let e2 = 0; t2.iterate({ enter: n => { if (n.type.isError) e2++; } });
assert.equal(e2, 0, emitted);
assert.deepEqual(lintAmtext(emitted), []);
assert.equal(stringify(amParse(emitted)), emitted, "stringify(parse(x)) is stable");
console.log("emit ok");
