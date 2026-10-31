"use client";

import { useCallback, useId, useMemo, useRef, type KeyboardEvent, type UIEvent } from "react";
import { highlightJs } from "./tokens";

/**
 * A code editor that is a `<textarea>` with a highlighted copy of its text
 * drawn underneath: the textarea is transparent except for its caret and
 * selection, the two share font, padding and scroll position. Works with the
 * keyboard, with a phone's on-screen keyboard and with screen readers (it is
 * still a textarea). Tab inserts two spaces; Escape then Tab leaves.
 */
export function CodeEditor({
  value,
  onChange,
  label,
  minLines = 8,
  maxLines = 22,
  readOnly = false,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  minLines?: number;
  maxLines?: number;
  readOnly?: boolean;
  className?: string;
}) {
  const id = useId();
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const escaped = useRef(false);

  const html = useMemo(() => {
    const lines = highlightJs(value).split("\n");
    // One gutter number per line; the trailing newline keeps the last line's height.
    return lines.map((l, i) => `<span class="ln" aria-hidden="true">${i + 1}</span>${l}`).join("\n") + "\n";
  }, [value]);

  const lineCount = value.split("\n").length;
  const rows = Math.min(maxLines, Math.max(minLines, lineCount + 1));

  const sync = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = e.currentTarget.scrollTop;
    pre.scrollLeft = e.currentTarget.scrollLeft;
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      escaped.current = true;
      return;
    }
    if (e.key === "Tab" && !escaped.current && !readOnly) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = ta;
      const next = value.slice(0, s) + "  " + value.slice(en);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
      return;
    }
    escaped.current = false;
  };

  return (
    <div className={`code-editor ${className}`} style={{ ["--rows" as string]: rows }}>
      <pre ref={preRef} aria-hidden="true" className="code-editor__pre">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      <textarea
        id={id}
        ref={taRef}
        aria-label={label}
        className="code-editor__ta"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onKeyDown={onKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        rows={rows}
      />
    </div>
  );
}
