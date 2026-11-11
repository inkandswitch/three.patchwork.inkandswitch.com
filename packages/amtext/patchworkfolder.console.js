"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // amtext.js
  var amtext_exports = {};
  __export(amtext_exports, {
    AmtextSyntaxError: () => AmtextSyntaxError,
    Counter: () => Counter,
    Cursor: () => Cursor,
    FUNCTIONS: () => FUNCTIONS,
    ImmutableString: () => ImmutableString,
    Link: () => Link,
    RichText: () => RichText,
    parse: () => parse,
    stringify: () => stringify
  });
  var Counter = class {
    constructor(value) {
      this.value = value;
    }
  };
  var ImmutableString = class {
    constructor(value) {
      this.value = value;
    }
  };
  var Link = class {
    constructor(path, segments = []) {
      this.path = path;
      this.segments = segments;
    }
  };
  var Cursor = class {
    constructor(from, to = from) {
      this.from = from;
      this.to = to;
    }
  };
  var RichText = class {
    constructor(spans) {
      this.spans = spans;
    }
  };
  var AmtextSyntaxError = class extends Error {
    constructor(message, src, pos) {
      let line = 1, col = 1;
      for (let i = 0; i < pos && i < src.length; i++) {
        if (src[i] === "\n") {
          line++;
          col = 1;
        } else col++;
      }
      super(`${message} (line ${line}, column ${col})`);
      this.name = "AmtextSyntaxError";
      this.reason = message;
      this.pos = pos;
      this.line = line;
      this.column = col;
    }
  };
  var FUNCTIONS = ["counter", "string", "bytes", "bytes64", "date", "link", "cursor", "richtext", "text", "block"];
  var IDENT_START = /[A-Za-z_@$]/;
  var IDENT_CHAR = /[A-Za-z0-9_@$-]/;
  var BARE_KEY = /^[A-Za-z_@$][A-Za-z0-9_@$-]*$/;
  var NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function setKey(obj, key, value) {
    Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  }
  var isPlainMap = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
  var isMarkValue = (v) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date || v instanceof Uint8Array || v instanceof Link;
  function b64decode(s) {
    const bin = atob(s.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function b64encode(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return btoa(bin);
  }
  function parse(src) {
    let i = 0;
    const fail = (msg, at = i) => {
      throw new AmtextSyntaxError(msg, src, at);
    };
    function skip() {
      for (; ; ) {
        const c = src[i];
        if (c === " " || c === "	" || c === "\n" || c === "\r" || c === ",") i++;
        else if (c === "/" && src[i + 1] === "/") {
          while (i < src.length && src[i] !== "\n") i++;
        } else return;
      }
    }
    function readIdent() {
      const start = i;
      i++;
      while (i < src.length && IDENT_CHAR.test(src[i])) i++;
      return src.slice(start, i);
    }
    function parseJsonString() {
      const start = i;
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i++;
        if (src[i] === "\n") fail('newline inside "..." string; use a `fenced` string for multiline text');
        i++;
      }
      if (i >= src.length) fail('unclosed "', start);
      i++;
      try {
        return JSON.parse(src.slice(start, i));
      } catch {
        return fail("bad string escape", start);
      }
    }
    function parseFence() {
      const start = i;
      let n = 0;
      while (src[i] === "`") {
        i++;
        n++;
      }
      const contentStart = i;
      let j = contentStart;
      for (; ; ) {
        const k = src.indexOf("`", j);
        if (k < 0) fail("unclosed `", start);
        let r = 0;
        while (src[k + r] === "`") r++;
        if (r === n) {
          i = k + n;
          return src.slice(contentStart, k);
        }
        j = k + r;
      }
    }
    function parseNumber() {
      const start = i;
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      if (!m) fail("bad number");
      i += m[0].length;
      if (i < src.length && (IDENT_CHAR.test(src[i]) || src[i] === ".")) fail("bad number", start);
      return Number(m[0]);
    }
    function parseArgs(name, at, item = parseValue) {
      i++;
      const args = [];
      for (; ; ) {
        skip();
        if (src[i] === ")") {
          i++;
          return args;
        }
        if (i >= src.length) fail(`unclosed ${name}(`, at);
        args.push(item());
      }
    }
    function parseRichItem() {
      skip();
      const c = src[i];
      if (c === '"') return { type: "text", value: parseJsonString() };
      if (c === "`") return { type: "text", value: parseFence() };
      if (c !== void 0 && IDENT_START.test(c)) {
        const at = i;
        const name = readIdent();
        if (src[i] !== "(" || name !== "text" && name !== "block") fail("richtext() takes strings, text() and block()", at);
        const args = parseArgs(name, at);
        if (name === "text") {
          if (args.length < 1 || args.length > 2 || typeof args[0] !== "string" || args.length === 2 && !isPlainMap(args[1])) {
            fail("text() takes a string and an optional { marks } map", at);
          }
          if (args.length === 1) return { type: "text", value: args[0] };
          for (const [k, v] of Object.entries(args[1])) {
            if (!isMarkValue(v)) fail(`mark "${k}" must be a string, number, bool, null, date(), bytes() or link()`, at);
          }
          return { type: "text", value: args[0], marks: args[1] };
        }
        if (args.length !== 1 || !isPlainMap(args[0])) fail("block() takes one { map }", at);
        return { type: "block", value: args[0] };
      }
      return fail("richtext() takes strings, text() and block()");
    }
    function parseLink(at) {
      const args = parseArgs("link", at, () => parseValue(true));
      const [path, ...segments] = args;
      if (typeof path !== "string") fail("link() takes a path string, then the path within that doc", at);
      segments.forEach((seg, n) => {
        if (seg instanceof Cursor) {
          if (n !== segments.length - 1) fail("cursor() goes last in link()", at);
        } else if (typeof seg !== "string" && !(Number.isInteger(seg) && seg >= 0) && !isPlainMap(seg)) {
          fail("link() path segments are keys, list indexes, { match } maps and a last cursor()", at);
        }
      });
      return new Link(path, segments);
    }
    function parseCall(name, at, inLink) {
      if (name === "richtext") return new RichText(parseArgs(name, at, parseRichItem));
      if (name === "text" || name === "block") fail(`${name}() only goes inside richtext()`, at);
      if (name === "link") return parseLink(at);
      if (name === "cursor" && !inLink) fail("cursor() only goes inside link()", at);
      const args = parseArgs(name, at);
      const one = (pred, what) => {
        if (args.length !== 1 || !pred(args[0])) fail(`${name}() takes ${what}`, at);
        return args[0];
      };
      switch (name) {
        case "counter":
          return new Counter(one(Number.isInteger, "one integer"));
        case "string":
          return new ImmutableString(one((a) => typeof a === "string", "one string"));
        case "bytes":
          if (!args.every((a) => Number.isInteger(a) && a >= 0 && a <= 255)) fail("bytes() takes integers 0-255", at);
          return new Uint8Array(args);
        case "bytes64": {
          const s = one((a) => typeof a === "string", "one base64 string");
          try {
            return b64decode(s);
          } catch {
            return fail("bad base64 in bytes64()", at);
          }
        }
        case "date": {
          const d = new Date(one((a) => typeof a === "string" || typeof a === "number", "an ISO string or ms number"));
          if (Number.isNaN(d.getTime())) fail("invalid date", at);
          return d;
        }
        case "cursor": {
          const position = (a) => Number.isInteger(a) && a >= 0;
          if (args.length < 1 || args.length > 2 || !args.every(position)) fail("cursor() takes one or two text positions", at);
          return new Cursor(...args);
        }
        default:
          return fail(`unknown function ${name}()`, at);
      }
    }
    function parseMap() {
      const start = i;
      i++;
      const obj = {};
      for (; ; ) {
        skip();
        if (src[i] === "}") {
          i++;
          return obj;
        }
        if (i >= src.length) fail("unclosed {", start);
        const keyAt = i;
        let key;
        if (src[i] === '"') key = parseJsonString();
        else if (IDENT_START.test(src[i])) key = readIdent();
        else fail("expected a key");
        if (Object.hasOwn(obj, key)) fail(`duplicate key ${JSON.stringify(key)}`, keyAt);
        skip();
        if (src[i] === "=" || src[i] === ":") i++;
        setKey(obj, key, parseValue());
      }
    }
    function parseList() {
      const start = i;
      i++;
      const arr = [];
      for (; ; ) {
        skip();
        if (src[i] === "]") {
          i++;
          return arr;
        }
        if (i >= src.length) fail("unclosed [", start);
        arr.push(parseValue());
      }
    }
    function parseValue(inLink = false) {
      skip();
      const c = src[i];
      if (c === void 0) fail("unexpected end of input");
      if (c === "{") return parseMap();
      if (c === "[") return parseList();
      if (c === '"') return parseJsonString();
      if (c === "`") return parseFence();
      if (c === "-" || c >= "0" && c <= "9") return parseNumber();
      if (IDENT_START.test(c)) {
        const at = i;
        const word = readIdent();
        if (word === "true") return true;
        if (word === "false") return false;
        if (word === "null") return null;
        if (src[i] === "(") return parseCall(word, at, inLink);
        fail(`unexpected word "${word}"`, at);
      }
      fail(`unexpected character ${JSON.stringify(c)}`);
    }
    skip();
    if (src[i] !== "{") fail("document must be a { map }");
    const doc = parseMap();
    skip();
    if (i < src.length) fail("unexpected content after the document");
    return doc;
  }
  function stringify(doc, opts = {}) {
    const { asCounter, asImmutableString, asLink, asRichText, indent = "  " } = opts;
    const pad = (d) => indent.repeat(d);
    const WIDTH = 72;
    const str = (s) => {
      if (s.includes("\n") && !s.includes("\r") && s[0] !== "`" && s[s.length - 1] !== "`") {
        let longest = 0;
        for (const m of s.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
        const fence = "`".repeat(longest + 1);
        return fence + s + fence;
      }
      return JSON.stringify(s);
    };
    const key = (k) => BARE_KEY.test(k) ? k : JSON.stringify(k);
    function writeLink(link, depth) {
      const segments = link.segments.map((seg) => {
        if (seg instanceof Cursor) return seg.from === seg.to ? `cursor(${seg.from})` : `cursor(${seg.from}, ${seg.to})`;
        if (typeof seg === "string") return JSON.stringify(seg);
        return write(seg, depth + 1, [], { inline: true, plain: true });
      });
      return `link(${[JSON.stringify(link.path), ...segments].join(", ")})`;
    }
    function writeRich(spans, depth, path) {
      if (!spans.length) return "richtext()";
      const inner = { inline: true, inRich: true };
      const items = spans.map((s, n) => {
        const p = [...path, "#richtext", n];
        if (s.type === "block") return `block(${write(s.value ?? {}, depth + 1, p, inner)})`;
        const marks = s.marks && Object.keys(s.marks).length ? s.marks : void 0;
        return marks ? `text(${str(s.value)}, ${write(marks, depth + 1, [...p, "marks"], inner)})` : str(s.value);
      });
      return `richtext(
${items.map((x) => pad(depth + 1) + x).join("\n")}
${pad(depth)})`;
    }
    function write(v, depth, path, mode = {}) {
      if (v === null) return "null";
      if (typeof v === "boolean") return String(v);
      if (typeof v === "number") {
        if (!Number.isFinite(v)) throw new TypeError(`amtext can't store ${v} (at ${path.join(".")})`);
        return Object.is(v, -0) ? "0" : String(v);
      }
      if (typeof v === "string") {
        if (mode.plain) return str(v);
        const l = asLink?.(v, path);
        if (l instanceof Link) return writeLink(l, depth);
        if (l !== void 0) return `link(${JSON.stringify(l)})`;
        if (!mode.inRich) {
          const spans = asRichText?.(v, path);
          if (spans) return writeRich(spans, depth, path);
        }
        return str(v);
      }
      const c = v instanceof Counter ? v.value : asCounter?.(v);
      if (c !== void 0) return `counter(${c})`;
      const im = v instanceof ImmutableString ? v.value : asImmutableString?.(v);
      if (im !== void 0) return `string(${str(im)})`;
      if (v instanceof Link) return writeLink(v, depth);
      if (v instanceof RichText) return writeRich(v.spans, depth, path);
      if (v instanceof Uint8Array) {
        return v.length <= 64 ? `bytes(${Array.from(v).join(", ")})` : `bytes64(${JSON.stringify(b64encode(v))})`;
      }
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) throw new TypeError(`invalid date at ${path.join(".")}`);
        return `date(${JSON.stringify(v.toISOString())})`;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) return "[]";
        const items = v.map((x, n) => write(x, depth + 1, [...path, n], mode));
        const inline = `[ ${items.join(", ")} ]`;
        if (!items.some((x) => x.includes("\n")) && inline.length <= WIDTH) return inline;
        return `[
${items.map((x) => pad(depth + 1) + x).join("\n")}
${pad(depth)}]`;
      }
      if (typeof v === "object") {
        const keys = Object.keys(v).filter((k) => v[k] !== void 0);
        if (keys.length === 0) return "{}";
        const entries = keys.map((k) => `${key(k)} ${write(v[k], depth + 1, [...path, k], mode)}`);
        if (mode.inline) {
          const inline = `{ ${entries.join(", ")} }`;
          if (!entries.some((x) => x.includes("\n")) && inline.length <= WIDTH) return inline;
        }
        return `{
${entries.map((x) => pad(depth + 1) + x).join("\n")}
${pad(depth)}}`;
      }
      throw new TypeError(`amtext can't store ${typeof v} (at ${path.join(".")})`);
    }
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      throw new TypeError("amtext document must be a map");
    }
    return write(doc, 0, []) + "\n";
  }

  // patchworkfolder.js
  var EXT = ".patchworkfolder";
  var ROOT = "root.amtext";
  var URL_RE = /^automerge:([1-9A-HJ-NP-Za-km-z]+)((?:\/[^#\s]*)?)(?:#\S*)?$/;
  function parseUrl(s) {
    const m = URL_RE.exec(s);
    if (!m) return void 0;
    const parts = m[2].split("/").filter(Boolean);
    const last = parts.at(-1);
    let cursors;
    if (last?.startsWith("[") && last.endsWith("]")) {
      parts.pop();
      const inner = last.slice(1, -1);
      const sep = inner.indexOf("-");
      cursors = sep < 0 ? [inner, inner] : [inner.slice(0, sep), inner.slice(sep + 1)];
      if (!cursors[0] || !cursors[1]) return void 0;
    }
    try {
      return { doc: `automerge:${m[1]}`, path: parts.map(parseSegment), cursors };
    } catch {
      return void 0;
    }
  }
  function parseSegment(s) {
    const index = /^@(\d+)$/.exec(s);
    if (index) return Number(index[1]);
    if (s.startsWith("{") || s.startsWith("%7B")) {
      const match = JSON.parse(decodeURIComponent(s));
      if (!isPlain(match)) throw new Error(`bad match ${s}`);
      return match;
    }
    if (s.startsWith("[")) throw new Error(`cursors before the end of ${s}`);
    if (s.startsWith("%5C")) return decodeURIComponent(s.slice(3));
    if (s.startsWith("\\")) return decodeURIComponent(s.slice(1));
    return decodeURIComponent(s);
  }
  function serializeSegment(seg) {
    if (typeof seg === "number") return `@${seg}`;
    if (typeof seg === "string") {
      if (seg === "") throw new Error("a url path can't have an empty key");
      return (/^[\\@{[]/.test(seg) ? "%5C" : "") + encodeURIComponent(seg);
    }
    const sorted = Object.fromEntries(Object.keys(seg).sort().map((k) => [k, seg[k]]));
    return encodeURIComponent(JSON.stringify(sorted));
  }
  var isPlain = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
  function propPath(doc, path) {
    const props = [];
    let v = doc;
    for (const seg of path) {
      if (v === null || typeof v !== "object") return void 0;
      let prop = seg;
      if (isPlain(seg)) {
        if (!Array.isArray(v)) return void 0;
        prop = v.findIndex((item) => item && Object.entries(seg).every(([k, x]) => item[k] === x));
        if (prop < 0) return void 0;
      }
      props.push(prop);
      v = v[prop];
    }
    return props;
  }
  var IDENTITY_KEYS = /* @__PURE__ */ new Set(["contactUrl"]);
  var OWN_PATCHWORK_KEYS = /* @__PURE__ */ new Set(["mainDraftUrl"]);
  function withoutOwnPatchworkKeys(doc) {
    const pw = doc["@patchwork"];
    if (!pw || typeof pw !== "object" || !Object.keys(pw).some((k) => OWN_PATCHWORK_KEYS.has(k))) return doc;
    const kept = {};
    for (const k of Object.keys(pw)) if (!OWN_PATCHWORK_KEYS.has(k)) kept[k] = pw[k];
    const out = {};
    for (const k of Object.keys(doc)) out[k] = k === "@patchwork" ? kept : doc[k];
    return out;
  }
  var CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 4294967295;
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  async function zip(files) {
    if (files.length > 65535) throw new Error("too many files for a zip without zip64");
    const enc = new TextEncoder();
    const now = /* @__PURE__ */ new Date();
    const dosTime = now.getHours() << 11 | now.getMinutes() << 5 | now.getSeconds() >> 1;
    const dosDate = now.getFullYear() - 1980 << 9 | now.getMonth() + 1 << 5 | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of files) {
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      let method = 8;
      let body = await pipe(data, new CompressionStream("deflate-raw"));
      if (body.length >= data.length) {
        method = 0;
        body = data;
      }
      if (offset + body.length > 4294967295) throw new Error("archive too large for a zip without zip64");
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 67324752, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 2048, true);
      lv.setUint16(8, method, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      const cen = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 33639248, true);
      cv.setUint16(4, 788, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 2048, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(38, 33188 << 16, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      parts.push(local, body);
      central.push(cen);
      offset += local.length + body.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 101010256, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((n, p2) => n + p2.length, 0));
    let p = 0;
    for (const a of all) {
      out.set(a, p);
      p += a.length;
    }
    return out;
  }
  async function unzip(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (v.getUint32(i, true) === 101010256) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("not a zip file");
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    if (count === 65535 || p === 4294967295) throw new Error("zip64 archives are not supported");
    const utf8 = new TextDecoder();
    const out = /* @__PURE__ */ new Map();
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 33639248) throw new Error("corrupt zip central directory");
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      const crc = v.getUint32(p + 16, true);
      const csize = v.getUint32(p + 20, true);
      const nlen = v.getUint16(p + 28, true);
      const xlen = v.getUint16(p + 30, true);
      const clen = v.getUint16(p + 32, true);
      const lho = v.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith("/")) continue;
      if (flags & 1) throw new Error(`${name}: encrypted zip entries are not supported`);
      const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      const raw = bytes.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await pipe(raw, new DecompressionStream("deflate-raw"));
      else throw new Error(`${name}: unsupported zip compression method ${method}`);
      if (crc32(data) !== crc) throw new Error(`${name}: crc mismatch`);
      out.set(name, data);
    }
    return out;
  }
  function resolvePath(fromFile, rel) {
    const parts = rel.startsWith("/") ? [] : fromFile.split("/").slice(0, -1);
    for (const seg of rel.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }
  function patchworkFolder(env = {}) {
    const ctx = () => {
      const g = globalThis;
      const c = {
        repo: env.repo ?? g.repo,
        hive: env.hive ?? g.hive,
        Automerge: env.Automerge ?? g.Automerge,
        plugins: env.plugins ?? g.patchwork?.plugins
      };
      if (!c.repo) throw new Error("no repo (window.repo is unset)");
      if (!c.Automerge) throw new Error("no Automerge (window.Automerge is unset)");
      return c;
    };
    const detectors = (A) => ({
      asCounter: (v) => A.Counter && v instanceof A.Counter ? v.value : void 0,
      asImmutableString: (v) => A.ImmutableString && v instanceof A.ImmutableString ? v.val : void 0
    });
    async function readDoc(repo, url) {
      const h = await repo.find(url);
      const doc = await h.doc();
      if (!doc) throw new Error(`${url} has no content`);
      return doc;
    }
    function richSpans(A, doc, path) {
      if (!A.spans) return void 0;
      let spans;
      try {
        spans = A.spans(doc, path);
      } catch {
        return void 0;
      }
      return spans.some((s) => s.type === "block" || s.marks && Object.keys(s.marks).length) ? spans : void 0;
    }
    function eachUrl(doc, A, f) {
      const visit = (v, path, inRich, key) => {
        if (typeof v === "string") {
          if (IDENTITY_KEYS.has(key)) return;
          const url = parseUrl(v);
          if (url) f(url.doc);
          else if (!inRich) {
            const spans = richSpans(A, doc, path);
            if (spans) for (const s of spans) visit(s.type === "block" ? s.value : s.marks ?? {}, [], true);
          }
          return;
        }
        if (v === null || typeof v !== "object") return;
        if (v instanceof Uint8Array || v instanceof Date) return;
        if (A.Counter && v instanceof A.Counter) return;
        if (A.ImmutableString && v instanceof A.ImmutableString) return;
        for (const k of Object.keys(v)) {
          if (!inRich && path.length === 0 && k === "@patchwork") continue;
          visit(v[k], inRich ? [] : [...path, Array.isArray(v) ? Number(k) : k], inRich, k);
        }
      };
      visit(doc, [], false);
    }
    async function collect(rootUrl) {
      const { repo, Automerge: A } = ctx();
      const root = parseUrl(rootUrl)?.doc;
      if (!root) throw new Error(`not an automerge url: ${rootUrl}`);
      const docs = /* @__PURE__ */ new Map();
      const failed = /* @__PURE__ */ new Set();
      const queue = [root];
      while (queue.length) {
        const url = queue.shift();
        if (docs.has(url) || failed.has(url)) continue;
        try {
          const doc = await readDoc(repo, url);
          docs.set(url, doc);
          eachUrl(doc, A, (u) => queue.push(u));
        } catch (e) {
          if (url === root) throw e;
          console.warn("patchworkFolder: could not load", url, e);
          failed.add(url);
        }
      }
      return { root, docs, failed: [...failed] };
    }
    async function exportFolder(rootUrl) {
      const { Automerge: A } = ctx();
      const { root, docs, failed } = await collect(rootUrl);
      const names = /* @__PURE__ */ new Map();
      for (const url of docs.keys()) names.set(url, url === root ? ROOT : `${crypto.randomUUID()}.amtext`);
      const enc = new TextEncoder();
      const files = [];
      const asLink = (s, path) => {
        if (path[0] === "@patchwork" || IDENTITY_KEYS.has(path.at(-1))) return void 0;
        const url = parseUrl(s);
        if (!url || !names.has(url.doc)) return void 0;
        const file = `./${names.get(url.doc)}`;
        if (!url.cursors) return url.path.length ? new Link(file, url.path) : file;
        const target = docs.get(url.doc);
        const props = propPath(target, url.path);
        let from, to;
        try {
          from = props && A.getCursorPosition(target, props, url.cursors[0]);
          to = props && A.getCursorPosition(target, props, url.cursors[1]);
        } catch {
        }
        if (!Number.isInteger(from) || !Number.isInteger(to)) {
          console.warn("patchworkFolder: no text for the cursors in", s, "so it's kept as it is");
          return void 0;
        }
        return new Link(file, [...url.path, new Cursor(from, to)]);
      };
      for (const [url, doc] of docs) {
        const text = stringify(withoutOwnPatchworkKeys(doc), {
          ...detectors(A),
          asLink,
          asRichText: (_s, path) => richSpans(A, doc, path)
        });
        files.push({ name: names.get(url), data: enc.encode(text) });
      }
      const bytes = await zip(files);
      const title = docs.get(root).title;
      const base = typeof title === "string" && title.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim().slice(0, 80) || root.slice("automerge:".length);
      return { bytes, filename: base + EXT, count: docs.size, failed };
    }
    async function downloadFolder(rootUrl) {
      const { bytes, filename, count, failed } = await exportFolder(rootUrl);
      const href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1e4);
      return { filename, count, failed };
    }
    async function createFor(value) {
      const { repo, hive, plugins } = ctx();
      const pw = value["@patchwork"];
      const typeId = pw && typeof pw.type === "string" ? pw.type : void 0;
      let datatype;
      if (typeId && plugins?.getRegistry) {
        try {
          datatype = await plugins.getRegistry("patchwork:datatype").load(typeId);
        } catch (e) {
          console.warn(`patchworkFolder: loading datatype "${typeId}" failed`, e);
        }
      }
      if (datatype && plugins.createDocOfDatatype2) {
        return { handle: await plugins.createDocOfDatatype2(datatype, repo, void 0, hive), typed: true };
      }
      if (typeId) console.warn(`patchworkFolder: no datatype "${typeId}"; creating a plain doc and copying @patchwork`);
      const handle = await repo.create();
      if (hive && plugins?.isKeyhiveDoc?.(handle.url)) await hive.addSyncServerRelayToDoc(handle.url);
      return { handle, typed: false };
    }
    function materialize(v, A, resolveLink, inRich = false) {
      if (v instanceof Link) return resolveLink(v, inRich);
      if (v instanceof RichText) {
        return new RichText(v.spans.map((s) => s.type === "block" ? { type: "block", value: materialize(s.value, A, resolveLink, true) } : s.marks ? { type: "text", value: s.value, marks: materialize(s.marks, A, resolveLink, true) } : { type: "text", value: s.value }));
      }
      if (v instanceof Counter) return new A.Counter(v.value);
      if (v instanceof ImmutableString) return new A.ImmutableString(v.value);
      if (v instanceof Uint8Array) return new Uint8Array(v);
      if (v instanceof Date) return new Date(v.getTime());
      if (Array.isArray(v)) return v.map((x) => materialize(x, A, resolveLink, inRich));
      if (v !== null && typeof v === "object") {
        const o = {};
        for (const k of Object.keys(v)) {
          Object.defineProperty(o, k, {
            value: materialize(v[k], A, resolveLink, inRich),
            enumerable: true,
            writable: true,
            configurable: true
          });
        }
        return o;
      }
      return v;
    }
    class CursorLink {
      constructor(file, url, path, cursor) {
        Object.assign(this, { file, url, path, cursor });
      }
    }
    function extract(v, is, placeholder, out, path = []) {
      if (is(v)) {
        out.push([path, v]);
        return placeholder;
      }
      if (Array.isArray(v)) return v.map((x, n) => extract(x, is, placeholder, out, [...path, n]));
      if (isPlain(v)) {
        for (const k of Object.keys(v)) v[k] = extract(v[k], is, placeholder, out, [...path, k]);
      }
      return v;
    }
    async function fill(handle, content, typed, A) {
      const skip = (k) => typed && k === "@patchwork";
      const rich = [];
      const cursorLinks = [];
      content = extract(content, (v) => v instanceof CursorLink, null, cursorLinks);
      content = extract(content, (v) => v instanceof RichText, "", rich);
      if (rich.length && !A.updateSpans) throw new Error("this Automerge has no updateSpans; can't import richtext()");
      await handle.change((d) => {
        for (const k of Object.keys(d)) if (!skip(k) && !Object.hasOwn(content, k)) delete d[k];
        for (const k of Object.keys(content)) if (!skip(k)) d[k] = content[k];
        for (const [path, { spans }] of rich) {
          if (!skip(path[0])) A.updateSpans(d, path, spans, spanConfig);
        }
      });
      return cursorLinks.filter(([path]) => !skip(path[0]));
    }
    function cursorUrl(A, target, link) {
      const props = propPath(target, link.path);
      let from, to;
      try {
        from = props && A.getCursor(target, props, link.cursor.from);
        to = props && A.getCursor(target, props, link.cursor.to);
      } catch {
      }
      if (!from || !to) {
        console.warn("patchworkFolder: no text at", link.url, "for its cursors, so they're left off");
        return link.url;
      }
      return `${link.url}/[${from === to ? from : `${from}-${to}`}]`;
    }
    function setAt(doc, path, value) {
      let v = doc;
      for (const k of path.slice(0, -1)) v = v[k];
      v[path.at(-1)] = value;
    }
    const spanConfig = env.spanConfig;
    function eachLink(v, f) {
      if (v instanceof Link) return f(v);
      if (Array.isArray(v)) return v.forEach((x) => eachLink(x, f));
      if (v !== null && typeof v === "object" && !(v instanceof Uint8Array) && !(v instanceof Date) && !(v instanceof Counter) && !(v instanceof ImmutableString)) {
        for (const k of Object.keys(v)) eachLink(v[k], f);
      }
    }
    async function importFolder(input) {
      const { Automerge: A } = ctx();
      const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());
      const entries = await unzip(bytes);
      const paths = [...entries.keys()].filter((p) => {
        const base = p.split("/").pop();
        return base.endsWith(".amtext") && !base.startsWith("._") && !p.startsWith("__MACOSX/");
      });
      if (!paths.length) throw new Error("no .amtext files in archive");
      const tops = new Set(paths.map((p) => p.includes("/") ? p.split("/")[0] : ""));
      const prefix = tops.size === 1 && !tops.has("") ? `${[...tops][0]}/` : "";
      const utf8 = new TextDecoder("utf-8", { fatal: true });
      const files = /* @__PURE__ */ new Map();
      for (const p of paths) {
        const rel = p.slice(prefix.length);
        try {
          files.set(rel, parse(utf8.decode(entries.get(p))));
        } catch (e) {
          e.message = `${rel}: ${e.message}`;
          throw e;
        }
      }
      const rootPath = files.has(ROOT) ? ROOT : files.size === 1 ? [...files.keys()][0] : void 0;
      if (!rootPath) throw new Error(`archive has several docs and no ${ROOT}`);
      for (const [p, v] of files) {
        eachLink(v, (l) => {
          if (!files.has(resolvePath(p, l.path))) throw new Error(`${p}: link(${JSON.stringify(l.path)}) is not in the archive`);
        });
      }
      const urls = /* @__PURE__ */ new Map();
      const created = /* @__PURE__ */ new Map();
      for (const [p, v] of files) {
        const c = await createFor(v);
        created.set(p, c);
        urls.set(p, c.handle.url);
      }
      const linkUrl = (p, link, inRich) => {
        const file = resolvePath(p, link.path);
        const last = link.segments.at(-1);
        const cursor = last instanceof Cursor ? last : void 0;
        const path = cursor ? link.segments.slice(0, -1) : link.segments;
        const url = [urls.get(file), ...path.map(serializeSegment)].join("/");
        if (!cursor) return url;
        if (inRich) {
          console.warn(`patchworkFolder: ${p}: cursors in rich text aren't supported, so they're left off`, url);
          return url;
        }
        return new CursorLink(file, url, path, cursor);
      };
      const toSet = [];
      for (const [p, v] of files) {
        const content = materialize(v, A, (link, inRich) => linkUrl(p, link, inRich));
        const { handle, typed } = created.get(p);
        for (const [path, link] of await fill(handle, content, typed, A)) toSet.push([handle, path, link]);
      }
      for (const [handle, path, link] of toSet) {
        const url = cursorUrl(A, created.get(link.file).handle.doc(), link);
        await handle.change((d) => setAt(d, path, url));
      }
      return { root: urls.get(rootPath), urls };
    }
    function pickAndImport() {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = `${EXT},.zip,.amtext`;
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return reject(new Error("no file chosen"));
          (f.name.endsWith(".amtext") ? f.text().then(importDocText).then((root) => ({ root })) : importFolder(f)).then(resolve, reject);
        };
        input.click();
      });
    }
    function dropToImport() {
      return new Promise((resolve, reject) => {
        const over = (e) => e.preventDefault();
        const drop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener("dragover", over, true);
          window.removeEventListener("drop", drop, true);
          const f = e.dataTransfer?.files?.[0];
          if (!f) return reject(new Error("no file dropped"));
          (f.name.endsWith(".amtext") ? f.text().then(importDocText).then((root) => ({ root })) : importFolder(f)).then(resolve, reject);
        };
        window.addEventListener("dragover", over, true);
        window.addEventListener("drop", drop, true);
        console.log("patchworkFolder: drop a file on the page");
      });
    }
    async function exportDocText(url) {
      const { repo, Automerge: A } = ctx();
      const doc = await readDoc(repo, url);
      return stringify(withoutOwnPatchworkKeys(doc), { ...detectors(A), asRichText: (_s, path) => richSpans(A, doc, path) });
    }
    async function importDocText(text) {
      const { Automerge: A } = ctx();
      const v = parse(text);
      eachLink(v, (l) => {
        throw new Error(`link(${JSON.stringify(l.path)}) needs a ${EXT} archive`);
      });
      const { handle, typed } = await createFor(v);
      await fill(handle, materialize(v, A, () => void 0), typed, A);
      return handle.url;
    }
    return { exportFolder, downloadFolder, importFolder, pickAndImport, dropToImport, exportDocText, importDocText };
  }

  // console-entry.js
  window.patchworkFolder = Object.assign(patchworkFolder(), { amtext: amtext_exports, zip, unzip, EXT, ROOT });
})();
