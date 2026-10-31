/**
 * A small JavaScript tokenizer for the editors on the try-out page. It
 * colours comments, strings, numbers, keywords, literals and call names on
 * the same palette as the shiki blocks (github-dark-default), in a few
 * dozen lines instead of shipping a grammar and a WASM engine to the
 * browser. It is a display aid, not a parser: the sandbox gets the raw text.
 */

const KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
  "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "of", "return",
  "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield",
]);
const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

const COLORS = {
  comment: "#8b949e",
  string: "#a5d6ff",
  number: "#79c0ff",
  keyword: "#ff7b72",
  literal: "#79c0ff",
  call: "#d2a8ff",
  ident: "#e6edf3",
  punct: "#c9d1d9",
} as const;

type Kind = keyof typeof COLORS;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const span = (kind: Kind, text: string) => `<span style="color:${COLORS[kind]}">${escapeHtml(text)}</span>`;

/** Source → HTML, one `<span>` per token, newlines kept. */
export function highlightJs(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];

    // comments
    if (c === "/" && next === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      out += span("comment", src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      out += span("comment", src.slice(i, j));
      i = j;
      continue;
    }

    // strings and templates (a template keeps one colour; `${}` is not split)
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      out += span("string", src.slice(i, j));
      i = j;
      continue;
    }

    // numbers
    if (/[0-9]/.test(c) || (c === "." && next !== undefined && /[0-9]/.test(next))) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-F_xXoObBn.eE+-]/.test(src[j]!)) {
        // stop a sign unless it follows an exponent
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1]!)) break;
        j++;
      }
      out += span("number", src.slice(i, j));
      i = j;
      continue;
    }

    // identifiers, keywords, literals, call names
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      const prevChar = i > 0 ? src[i - 1] : "";
      let k = j;
      while (k < n && (src[k] === " " || src[k] === "\t")) k++;
      const kind: Kind =
        prevChar === "." ? (src[k] === "(" ? "call" : "ident")
        : KEYWORDS.has(word) ? "keyword"
        : LITERALS.has(word) ? "literal"
        : src[k] === "(" ? "call"
        : "ident";
      out += span(kind, word);
      i = j;
      continue;
    }

    // whitespace passes through; everything else is punctuation
    if (c === "\n" || c === " " || c === "\t" || c === "\r") {
      out += c;
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && /[^\w\s$"'`/]/.test(src[j]!) && !(src[j] === "." && src[j + 1] !== undefined && /[0-9]/.test(src[j + 1]!))) j++;
    out += span("punct", src.slice(i, j));
    i = j;
  }
  return out;
}
