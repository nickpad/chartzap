/**
 * Autocomplete tests for the formula editor.
 *
 * This file contains two types of tests:
 *
 * 1. Completion source tests - Test what completions are suggested by calling
 *    the completion source directly with a CompletionContext.
 *
 * 2. Completion application tests - Test what happens when a completion is picked,
 *    including document changes and cursor repositioning. These use the
 *    pickedCompletion annotation to exercise the autoCompleteCursor transaction filter.
 */
import { CompletionContext, pickedCompletion } from "@codemirror/autocomplete";
import type { CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

import {
  newAutocompleteExtension,
  newColumnCompletionSource,
  newResultSetColumnCompletionSource,
} from "../../packages/codemirror/src/autocomplete.js";
import { formula } from "../../packages/codemirror/src/language.js";
import { describe, expect, test } from "vitest";

import { formatDocWithCursor, newDocState, parseDoc } from "./test-utils.js";

// -----------------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------------

const columnLookup = new Map(
  Object.entries({
    Products: ["product_id", "name"],
    Categories: ["category_name"],
  }),
);
const resultSetColumns = ["Product name", "Order count"];
const functionNames = ["Ceiling", "Contains", "Floor", "Sum"];

const columnSource = newColumnCompletionSource(columnLookup, functionNames);
const filterSource = newResultSetColumnCompletionSource(resultSetColumns, functionNames);

// -----------------------------------------------------------------------------
// Completion source test helpers
// -----------------------------------------------------------------------------

async function complete(source: CompletionSource, doc: string, explicit = false) {
  const { state, cursor } = newDocState(doc);
  const completionContext = new CompletionContext(state, cursor, explicit);
  return source(completionContext);
}

function labels(results: CompletionResult | null): string[] {
  if (results === null) {
    return [];
  }
  return results.options.map((o) => o.label);
}

function createStateWithExtensions(doc: string, isFilter = false): EditorState {
  const { text, cursor } = parseDoc(doc);
  const formulaLang = formula();

  const autocompleteConfig = isFilter
    ? {
        isFilter: true as const,
        resultSetColumns,
        functionNames,
      }
    : {
        isFilter: false as const,
        lookup: columnLookup,
        functionNames,
      };

  return EditorState.create({
    doc: text,
    selection: { anchor: cursor },
    extensions: [formulaLang, ...newAutocompleteExtension(autocompleteConfig)],
  });
}

async function applyCompletion(doc: string, label: string, isFilter = false): Promise<EditorState> {
  const state = createStateWithExtensions(doc, isFilter);
  const source = isFilter ? filterSource : columnSource;
  const cursor = state.selection.main.head;

  const context = new CompletionContext(state, cursor, true);
  const result = source(context);

  if (!result) {
    throw new Error(`No completion result for doc: ${doc}`);
  }

  const completion = result.options.find((o) => o.label === label);
  if (!completion) {
    throw new Error(
      `No completion found for label "${label}". Available: ${result.options.map((o) => o.label).join(", ")}`,
    );
  }

  const insertText = typeof completion.apply === "string" ? completion.apply : completion.label;
  const from = result.from;
  const to = result.to ?? cursor;

  const transaction = state.update({
    changes: { from, to, insert: insertText },
    selection: { anchor: from + insertText.length },
    annotations: pickedCompletion.of(completion),
  });

  return transaction.state;
}

function getDocWithCursor(state: EditorState): string {
  return formatDocWithCursor(state.doc.toString(), state.selection.main.head);
}

describe("Completion source: column context", () => {
  describe("table name suggestions", () => {
    test("at top level of formula", async () => {
      const results = await complete(columnSource, "P|");
      expect(labels(results)).toContain("Products");
    });

    test("when multiple characters have been entered", async () => {
      const results = await complete(columnSource, "Prod|");
      expect(labels(results)).toContain("Products");
    });

    test("in the middle of formulas", async () => {
      const results = await complete(columnSource, `Contains(Prod|, "food")`);
      expect(labels(results)).toContain("Products");
    });

    test("after an opening square bracket", async () => {
      const results = await complete(columnSource, "[|");
      expect(labels(results)).toContain("Products");
    });

    test("after an opening bracket with partial input", async () => {
      const results = await complete(columnSource, "[Pro|]");
      expect(labels(results)).toContain("Products");
    });
  });

  describe("column name suggestions", () => {
    test("after the table name", async () => {
      const results = await complete(columnSource, "[Products/|");
      expect(labels(results)).toContain("product_id");
      expect(labels(results)).not.toContain("category_name");
      expect(labels(results)).not.toContain("Products");
    });

    test("when entering a column name", async () => {
      const results = await complete(columnSource, "[Categories/cat|");
      expect(labels(results)).toContain("category_name");
    });

    test("in the middle of formulas", async () => {
      const results = await complete(columnSource, `Contains([Products/p|], "food")`);
      expect(labels(results)).toContain("product_id");
    });
  });

  describe("function name suggestions", () => {
    test("at top level", async () => {
      const results = await complete(columnSource, "Con|");
      expect(labels(results)).toContain("Contains");
    });

    test("when typing in lowercase", async () => {
      const results = await complete(columnSource, "ceil|");
      expect(labels(results)).toContain("Ceiling");
    });

    test("when typing in upper case", async () => {
      const results = await complete(columnSource, "FLO|");
      expect(labels(results)).toContain("Floor");
    });

    test("not suggested in table name position", async () => {
      const results = await complete(columnSource, "[Con|]");
      expect(labels(results)).not.toContain("Contains");
    });

    test("not suggested in column name position", async () => {
      const results = await complete(columnSource, "[Products/c|]");
      expect(labels(results)).not.toContain("Contains");
    });
  });

  test("no suggestions immediately after closing a column", async () => {
    const results = await complete(columnSource, "[Products/product_id]|");
    expect(results?.options.length).toBe(0);
  });

  describe("explicit activation", () => {
    test("no suggestions on empty text", async () => {
      const { state, cursor } = newDocState("|");
      const context = new CompletionContext(state, cursor, false);
      const results = columnSource(context);
      expect(labels(results)).toEqual([]);
    });
  });

  describe("edge cases", () => {
    test("returns empty options for unknown table", async () => {
      const results = await complete(columnSource, "[UnknownTable/|]");
      expect(labels(results)).toEqual([]);
    });

    test("returns empty options when extra path segment exists", async () => {
      const results = await complete(columnSource, "[Products/product_id/|]");
      expect(labels(results)).toEqual([]);
    });
  });

  describe("completion apply values", () => {
    test("table completion inside brackets ends with /", async () => {
      const { state, cursor } = newDocState("[Pro|]");
      const completionContext = new CompletionContext(state, cursor, false);
      const result = columnSource(completionContext);
      const match = result?.options.find((opt) => opt.label === "Products");

      expect(match?.apply).toBe("Products/");
    });

    test("table completion at top level includes brackets", async () => {
      const { state, cursor } = newDocState("Pro|");
      const completionContext = new CompletionContext(state, cursor, false);
      const result = columnSource(completionContext);
      const match = result?.options.find((opt) => opt.label === "Products");

      expect(match?.apply).toBe("[Products/]");
    });
  });
});

describe("Completion source: filter context", () => {
  describe("result set column suggestions", () => {
    test("at top level of formula", async () => {
      const results = await complete(filterSource, "Pro|");
      expect(labels(results)).toContain("Product name");
    });

    test("when inside braces", async () => {
      const results = await complete(filterSource, "{Pro|}");
      expect(labels(results)).toContain("Product name");
    });

    test("in a more complex formula", async () => {
      const results = await complete(filterSource, "IF({Pro|}, 1, 0)");
      expect(labels(results)).toContain("Product name");
    });

    test("in empty formula", async () => {
      const results = await complete(filterSource, "|");
      expect(labels(results)).toContain("Product name");
    });
  });

  describe("function name suggestions", () => {
    test("at top level", async () => {
      const results = await complete(filterSource, "Con|");
      expect(labels(results)).toContain("Contains");
    });

    test("when typing in lowercase", async () => {
      const results = await complete(filterSource, "ceil|");
      expect(labels(results)).toContain("Ceiling");
    });

    test("when typing in upper case", async () => {
      const results = await complete(filterSource, "FLO|");
      expect(labels(results)).toContain("Floor");
    });

    test("not suggested inside braces", async () => {
      const results = await complete(filterSource, "{CON|}");
      expect(labels(results)).not.toContain("CONTAINS");
    });
  });

  test("no suggestions immediately after closing a result set column", async () => {
    const results = await complete(filterSource, "{Product name}|");
    expect(labels(results)).toEqual([]);
  });

  test("suggestions available when typing inside result set column braces", async () => {
    // When cursor is inside braces on a ResultSetColumnName node,
    // suggestions for result set columns are still available
    const results = await complete(filterSource, "{Product name|}");
    expect(labels(results)).toContain("Product name");
    expect(labels(results)).toContain("Order count");
  });
});

describe.each([
  ["column", columnSource],
  ["filter", filterSource],
] as const)("Completion source: %s context - shared behavior", (_, source) => {
  describe("boolean literal suggestions", () => {
    test("TRUE is suggested", async () => {
      const results = await complete(source, "tr|");
      expect(labels(results)).toContain("TRUE");
    });

    test("FALSE is suggested", async () => {
      const results = await complete(source, "fa|");
      expect(labels(results)).toContain("FALSE");
    });
  });

  describe("no suggestions", () => {
    test("when typing a number literal", async () => {
      const results = await complete(source, "123|");
      expect(labels(results)).toEqual([]);
    });

    test("when in a comment", async () => {
      const results = await complete(source, "// Prod|");
      expect(labels(results)).toEqual([]);
    });
  });
});

describe("Completion result validFor patterns", () => {
  test("returns VALID_FOR_IDENTIFIER pattern for top-level column context", async () => {
    const results = await complete(columnSource, "Pro|", true);
    expect(results?.validFor).toEqual(/^\w*$/);
  });

  test("returns VALID_FOR_OBJECT_NAME pattern for table name in brackets", async () => {
    const results = await complete(columnSource, "[Pro|]", true);
    expect(results?.validFor).toEqual(/^[^[\]/]*$/);
  });

  test("returns VALID_FOR_OBJECT_NAME pattern for column name", async () => {
    const results = await complete(columnSource, "[Products/p|]", true);
    expect(results?.validFor).toEqual(/^[^[\]/]*$/);
  });

  test("returns VALID_FOR_RESULT_SET_COLUMN_NAME pattern for result set columns", async () => {
    const results = await complete(filterSource, "{Pro|}", true);
    expect(results?.validFor).toEqual(/^[^{}]*$/);
  });

  test("returns VALID_FOR_IDENTIFIER pattern for top-level filter context", async () => {
    const results = await complete(filterSource, "Pro|", true);
    expect(results?.validFor).toEqual(/^\w*$/);
  });
});

describe("applyCompletion error handling", () => {
  test("throws when no completion result for document", async () => {
    await expect(applyCompletion("123|", "Products")).rejects.toThrow(
      "No completion result for doc: 123|",
    );
  });

  test("throws with available options when label not found", async () => {
    await expect(applyCompletion("Pro|", "NonExistent")).rejects.toThrow(
      /No completion found for label "NonExistent". Available:/,
    );
  });
});

describe("Completion application: column context", () => {
  describe("table name completion", () => {
    test("at top level inserts bracketed form with cursor before ]", async () => {
      const newState = await applyCompletion("Pro|", "Products");
      expect(getDocWithCursor(newState)).toBe("[Products/|]");
    });

    test("inside brackets inserts table name with slash", async () => {
      const newState = await applyCompletion("[Pro|]", "Products");
      expect(getDocWithCursor(newState)).toBe("[Products/|]");
    });

    test("in empty brackets inserts table name with slash", async () => {
      const newState = await applyCompletion("[|]", "Products");
      expect(getDocWithCursor(newState)).toBe("[Products/|]");
    });
  });

  describe("column name completion", () => {
    test("cursor stays at end after column completion", async () => {
      const newState = await applyCompletion("[Products/prod|]", "product_id");
      expect(getDocWithCursor(newState)).toBe("[Products/product_id|]");
    });
  });

  describe("function completion", () => {
    test("cursor moves inside parentheses", async () => {
      const newState = await applyCompletion("Sum|", "Sum");
      expect(getDocWithCursor(newState)).toBe("Sum(|)");
    });

    test("cursor moves inside parentheses for longer function names", async () => {
      const newState = await applyCompletion("Con|", "Contains");
      expect(getDocWithCursor(newState)).toBe("Contains(|)");
    });

    test("function completion in middle of formula", async () => {
      const newState = await applyCompletion("IF(Con|, 1, 0)", "Contains");
      expect(getDocWithCursor(newState)).toBe("IF(Contains(|), 1, 0)");
    });
  });

  describe("boolean completion", () => {
    test("cursor stays at end for TRUE", async () => {
      const newState = await applyCompletion("TRU|", "TRUE");
      expect(getDocWithCursor(newState)).toBe("TRUE|");
    });

    test("cursor stays at end for FALSE", async () => {
      const newState = await applyCompletion("FAL|", "FALSE");
      expect(getDocWithCursor(newState)).toBe("FALSE|");
    });
  });

  describe("complex scenarios", () => {
    test("table completion in function argument", async () => {
      const newState = await applyCompletion("Sum(Pro|)", "Products");
      expect(getDocWithCursor(newState)).toBe("Sum([Products/|])");
    });
  });
});

describe("Completion application: filter context", () => {
  describe("result set column completion", () => {
    test("at top level inserts braced form with cursor at end", async () => {
      const newState = await applyCompletion("Pro|", "Product name", true);
      expect(getDocWithCursor(newState)).toBe("{Product name}|");
    });

    test("inside braces inserts column name with cursor at end", async () => {
      const newState = await applyCompletion("{Pro|}", "Product name", true);
      expect(getDocWithCursor(newState)).toBe("{Product name|}");
    });

    test("in empty braces inserts column name", async () => {
      const newState = await applyCompletion("{|}", "Product name", true);
      expect(getDocWithCursor(newState)).toBe("{Product name|}");
    });
  });

  describe("function completion in filter context", () => {
    test("cursor moves inside parentheses", async () => {
      const newState = await applyCompletion("Sum|", "Sum", true);
      expect(getDocWithCursor(newState)).toBe("Sum(|)");
    });
  });
});

describe("Completion chaining: table to column", () => {
  test("column suggestions should be available immediately after completing a table name", async () => {
    // Simulate: user types "Pro", picks "Products", cursor is now at [Products/|]
    // We need to verify that column suggestions are available at this position
    const stateAfterTableCompletion = await applyCompletion("Pro|", "Products", false);

    // Verify the document state after table completion
    expect(getDocWithCursor(stateAfterTableCompletion)).toBe("[Products/|]");

    // Now check if column suggestions are available at the current cursor position
    const cursor = stateAfterTableCompletion.selection.main.head;
    const context = new CompletionContext(
      stateAfterTableCompletion,
      cursor,
      false, // not explicit - this simulates automatic triggering
    );
    const result = columnSource(context);

    // This is the key assertion: after completing a table name,
    // column suggestions should immediately be available
    expect(result).not.toBeNull();
    expect(labels(result)).toContain("product_id");
    expect(labels(result)).toContain("name");
    expect(labels(result)).not.toContain("Products"); // Should not suggest tables
  });

  test("column suggestions available after table completion inside brackets", async () => {
    const stateAfterTableCompletion = await applyCompletion("[Pro|]", "Products", false);

    expect(getDocWithCursor(stateAfterTableCompletion)).toBe("[Products/|]");

    const cursor = stateAfterTableCompletion.selection.main.head;
    const context = new CompletionContext(stateAfterTableCompletion, cursor, false);
    const result = columnSource(context);

    expect(result).not.toBeNull();
    expect(labels(result)).toContain("product_id");
    expect(labels(result)).toContain("name");
  });

  test("table completion apply value ends with / for START_COMPLETION_SUFFIXES", async () => {
    // Verify the apply values match what autoCompleteStart expects
    const { state, cursor } = newDocState("[Pro|]");
    const context = new CompletionContext(state, cursor, true);
    const result = columnSource(context);
    const productsOption = result?.options.find((o) => o.label === "Products");

    // Inside brackets, apply should be "Products/" which ends with "/"
    expect(productsOption?.apply).toBe("Products/");
    expect((productsOption!.apply as string).endsWith("/")).toBe(true);
  });

  test("top-level table completion apply value ends with /] for START_COMPLETION_SUFFIXES", async () => {
    const { state, cursor } = newDocState("Pro|");
    const context = new CompletionContext(state, cursor, true);
    const result = columnSource(context);
    const productsOption = result?.options.find((o) => o.label === "Products");

    // At top level, apply should be "[Products/]" which ends with "/]"
    expect(productsOption?.apply).toBe("[Products/]");
    expect((productsOption!.apply as string).endsWith("/]")).toBe(true);
  });

  test("from position is correct after completing table name", async () => {
    // After completing a table name, the cursor is at [Products/|]
    // The completion source should return from: 10 (after the /)
    // so that column completion inserts at the right position
    const stateAfterTableCompletion = await applyCompletion("Pro|", "Products", false);

    const cursor = stateAfterTableCompletion.selection.main.head;
    const context = new CompletionContext(stateAfterTableCompletion, cursor, false);
    const result = columnSource(context);

    expect(result?.from).toBe(10); // Position after the /
    expect(labels(result)).toContain("product_id");
    expect(labels(result)).toContain("name");
  });

  test("from position is correct when partially typing column name", async () => {
    // When user has typed part of column name: [Products/prod|]
    // The from should be 10 (start of "prod")
    const { state, cursor } = newDocState("[Products/prod|]");
    const context = new CompletionContext(state, cursor, false);
    const result = columnSource(context);

    expect(result?.from).toBe(10);
    expect(labels(result)).toContain("product_id");
  });
});

describe("newAutocompleteExtension", () => {
  test("returns 3 extensions for column context (includes autoCompleteStart)", () => {
    const extensions = newAutocompleteExtension({
      isFilter: false,
      lookup: columnLookup,
      functionNames,
    });
    // Column context includes: autoComplete, autoCompleteCursor, autoCompleteStart
    expect(extensions).toHaveLength(3);
  });

  test("returns 2 extensions for filter context (no autoCompleteStart)", () => {
    const extensions = newAutocompleteExtension({
      isFilter: true,
      resultSetColumns,
      functionNames,
    });
    // Filter context includes: autoComplete, autoCompleteCursor
    // (no autoCompleteStart because filter context doesn't chain completions)
    expect(extensions).toHaveLength(2);
  });
});
