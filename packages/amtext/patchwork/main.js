/**
 * amtext as a patchwork package:
 *
 * - .amtext files get the amtext language (highlighting, folding, lint,
 *   completions) in patchwork's file editor
 * - a "patchwork:archive" plugin packs a doc and every doc it links to into a
 *   .patchworkfolder, and unpacks one into fresh docs. The sideboard uses it
 *   to download folders and to take .patchworkfolder files dropped on it.
 */

import { Compartment } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";

// patchwork's file tool asks for extra CodeMirror extensions with this event,
// just before it makes its editor (see base/file's codemirror-extensions.ts).
// it bubbles out of the tool, so listening on the window hears every editor.
const EXTENSIONS_EVENT = "file:codemirror-extensions";
const LISTENING = Symbol.for("amtext:codemirror-extensions");

const isAmtext = doc =>
  typeof doc?.extension === "string" && doc.extension.replace(/^\./, "").toLowerCase() === "amtext";

// the event wants extensions now, but the language is loaded on demand: start
// with an empty compartment and fill it in once the language has arrived
function lazyAmtext() {
  const language = new Compartment();
  return [
    language.of([]),
    ViewPlugin.define(view => {
      let live = true;
      import("./codemirror.js")
        .then(({ amtext }) => {
          if (live) view.dispatch({ effects: language.reconfigure(amtext()) });
        })
        .catch(error => console.error("amtext: couldn't load the codemirror language", error));
      return { destroy() { live = false; } };
    }),
  ];
}

if (!globalThis[LISTENING]) {
  globalThis[LISTENING] = true;
  window.addEventListener(EXTENSIONS_EVENT, event => {
    if (isAmtext(event.detail?.doc)) event.detail.extensions.push(lazyAmtext());
  });
}

export const plugins = [
  {
    type: "patchwork:archive",
    id: "patchworkfolder",
    name: "Patchwork folder",
    extension: ".patchworkfolder",
    async load() {
      const { archive } = await import("./archive.js");
      return archive;
    },
  },
];
