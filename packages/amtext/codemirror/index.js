import {
  LRLanguage, LanguageSupport, indentNodeProp, foldNodeProp, foldInside, delimitedIndent, syntaxTree,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";
import { linter } from "@codemirror/lint";
import { snippetCompletion } from "@codemirror/autocomplete";
import { parser } from "./parser.js";
import { parse, AmtextSyntaxError } from "../amtext.js";

export const amtextLanguage = LRLanguage.define({
  name: "amtext",
  parser: parser.configure({
    props: [
      styleTags({
        "PropertyName/Identifier PropertyName/String PropertyName/true PropertyName/false PropertyName/null": t.propertyName,
        "PropertyName/MetaName": t.meta,
        "Callee/Identifier": t.function(t.variableName),
        String: t.string,
        Fence: t.special(t.string),
        Number: t.number,
        "true false": t.bool,
        null: t.null,
        LineComment: t.lineComment,
        "{ }": t.brace,
        "[ ]": t.squareBracket,
        "( )": t.paren,
        "= :": t.definitionOperator,
      }),
      indentNodeProp.add({
        Map: delimitedIndent({ closing: "}" }),
        List: delimitedIndent({ closing: "]" }),
        ArgList: delimitedIndent({ closing: ")" }),
        Fence: () => null,
      }),
      foldNodeProp.add({
        "Map List ArgList": foldInside,
        Fence: node => (node.to - node.from > 2 ? { from: node.from + 1, to: node.to - 1 } : null),
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", "{", '"', "`"] },
    indentOnInput: /^\s*[}\])]$/,
  },
});

const completions = [
  snippetCompletion("counter(${0})", { label: "counter", type: "function", detail: "Counter" }),
  snippetCompletion('string("${}")', { label: "string", type: "function", detail: "ImmutableString" }),
  snippetCompletion("bytes(${})", { label: "bytes", type: "function", detail: "Uint8Array" }),
  snippetCompletion('bytes64("${}")', { label: "bytes64", type: "function", detail: "Uint8Array, base64" }),
  snippetCompletion('date("${}")', { label: "date", type: "function", detail: "Date" }),
  snippetCompletion('link("./${}.amtext")', { label: "link", type: "function", detail: "doc in this folder" }),
  snippetCompletion("cursor(${1}, ${2})", { label: "cursor", type: "function", detail: "text range (last in link)" }),
  snippetCompletion("richtext(\n\t${}\n)", { label: "richtext", type: "function", detail: "text with marks/blocks" }),
  snippetCompletion('text("${1}", { ${2} })', { label: "text", type: "function", detail: "marked run (in richtext)" }),
  snippetCompletion('block({ type string("${1}"), parents [], attrs {} })', { label: "block", type: "function", detail: "block marker (in richtext)" }),
  { label: "true", type: "keyword" },
  { label: "false", type: "keyword" },
  { label: "null", type: "keyword" },
];

function completeAmtext(ctx) {
  const node = syntaxTree(ctx.state).resolveInner(ctx.pos, -1);
  if (node.name === "String" || node.name === "Fence" || node.name === "LineComment") return null;
  const word = ctx.matchBefore(/[A-Za-z_$][A-Za-z0-9_@$-]*/);
  if (!word && !ctx.explicit) return null;
  return { from: word ? word.from : ctx.pos, options: completions, validFor: /^[A-Za-z0-9_$-]*$/ };
}

/** Full-strictness check with the real parser (also catches duplicate keys, bad call args). */
export function lintAmtext(text) {
  try {
    parse(text);
    return [];
  } catch (e) {
    if (!(e instanceof AmtextSyntaxError)) throw e;
    const from = Math.min(e.pos, text.length);
    const word = /^[^\s,{}[\]()]+/.exec(text.slice(from, from + 200));
    const to = Math.min(text.length, from + (word ? word[0].length : 1));
    return [{ from, to, severity: "error", message: e.reason }];
  }
}

export const amtextLinter = linter(view => lintAmtext(view.state.doc.toString()));

/** amtext() -> LanguageSupport. Pass { lint: false } to leave the linter out. */
export function amtext(config = {}) {
  const extensions = [amtextLanguage.data.of({ autocomplete: completeAmtext })];
  if (config.lint !== false) extensions.push(amtextLinter);
  return new LanguageSupport(amtextLanguage, extensions);
}
