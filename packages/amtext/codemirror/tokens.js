import { ExternalTokenizer } from "@lezer/lr";
import { Fence } from "./parser.terms.js";

const BACKTICK = 96;

// `text`, ``text with ` inside``: closes on a run of exactly as many backticks as opened it
export const fence = new ExternalTokenizer(input => {
  if (input.next !== BACKTICK) return;
  let n = 0;
  while (input.next === BACKTICK) { n++; input.advance(); }
  for (;;) {
    if (input.next < 0) { input.acceptToken(Fence); return; } // unterminated: take the rest
    if (input.next === BACKTICK) {
      let r = 0;
      while (input.next === BACKTICK) { r++; input.advance(); }
      if (r === n) { input.acceptToken(Fence); return; }
    } else input.advance();
  }
});
