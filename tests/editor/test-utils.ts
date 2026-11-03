/**
 * Shared test utilities for formula editor tests.
 */
import { EditorState } from "@codemirror/state";

import { formula } from "../../packages/codemirror/src/language.js";

/**
 * Parse a document string with a cursor marker (|) and return the text and cursor position.
 */
export function parseDoc(doc: string): { text: string; cursor: number } {
  const cursor = doc.indexOf("|");
  if (cursor === -1) {
    throw new Error("No cursor position (|) found in document");
  }
  const text = doc.slice(0, cursor) + doc.slice(cursor + 1);
  return { text, cursor };
}

/**
 * Format a document with a cursor marker at the given position.
 */
export function formatDocWithCursor(text: string, cursor: number): string {
  return text.slice(0, cursor) + "|" + text.slice(cursor);
}

/**
 * Create an EditorState with the formula language extension.
 * The doc string should contain a | to mark cursor position.
 */
export function newDocState(doc: string): {
  state: EditorState;
  cursor: number;
} {
  const { text, cursor } = parseDoc(doc);
  const formulaLang = formula();
  const state = EditorState.create({
    doc: text,
    selection: { anchor: cursor },
    extensions: [formulaLang],
  });
  return { state, cursor };
}
