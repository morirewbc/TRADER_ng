import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

const bg = "#0c0c0e";
const surface = "#18181b";
const border = "#27272a";
const text = "#fafafa";
const textDim = "#71717a";

export const pineTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: bg,
      color: text,
      fontSize: "13px",
      fontFamily: "var(--font-jetbrains-mono), monospace",
    },
    ".cm-content": {
      padding: "12px 0",
      caretColor: text,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: text,
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(161, 161, 170, 0.15) !important",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    ".cm-gutters": {
      backgroundColor: bg,
      color: textDim,
      border: "none",
      borderRight: `1px solid ${border}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      color: text,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 12px",
      minWidth: "40px",
      fontSize: "12px",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: surface,
      border: `1px solid ${border}`,
      color: textDim,
    },
    ".cm-tooltip": {
      backgroundColor: surface,
      border: `1px solid ${border}`,
      color: text,
    },
    ".cm-panels": {
      backgroundColor: surface,
      color: text,
    },
  },
  { dark: true }
);

export const pineHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#e4e4e7", fontWeight: "bold" },
    { tag: tags.operator, color: "#a1a1aa" },
    { tag: tags.variableName, color: text },
    { tag: tags.function(tags.definition(tags.variableName)), color: "#d4d4d8" },
    { tag: tags.typeName, color: "#a1a1aa", fontStyle: "italic" },
    { tag: tags.number, color: "#d4d4d8" },
    { tag: tags.string, color: "#a1a1aa" },
    { tag: tags.lineComment, color: "#52525b", fontStyle: "italic" },
    { tag: tags.meta, color: "#a1a1aa" },
    { tag: tags.namespace, color: "#d4d4d8" },
    { tag: tags.punctuation, color: textDim },
    { tag: tags.bool, color: "#d4d4d8" },
  ])
);
