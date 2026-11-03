import { pickedCompletion, startCompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { formulaLanguage } from "./language.js";

// Regex patterns for validFor: allows completion results to be reused as user types
// Each pattern matches the valid characters for its corresponding syntax node type
const VALID_FOR_IDENTIFIER = /^\w*$/;
const VALID_FOR_OBJECT_NAME = /^[^[\]/]*$/;
const VALID_FOR_RESULT_SET_COLUMN_NAME = /^[^{}]*$/;

const BOOLEAN_OPTIONS = ["TRUE", "FALSE"].map((label) => {
  return {
    label,
    type: "boolean",
  };
});

function makeFunctionOptions(functionNames: string[]) {
  return functionNames.map((name) => {
    return {
      label: name,
      type: "function",
      apply: `${name}()`,
    };
  });
}

function completeTables(lookup: Map<string, string[]>, syntaxNodeName: string) {
  return Array.from(lookup.keys()).map((key) => {
    const hasSurround = syntaxNodeName === "Column" || syntaxNodeName === "ObjectName";
    const apply = hasSurround ? `${key}/` : `[${key}/]`;
    return {
      label: key,
      type: "variable",
      apply,
    };
  });
}

function completeColumns(
  context: CompletionContext,
  lookup: Map<string, string[]>,
  tableNode: SyntaxNode,
) {
  const tableName = context.state.sliceDoc(tableNode.from, tableNode.to);
  const columnNames = lookup.get(tableName) || [];
  return columnNames.map((columnName) => {
    return {
      label: columnName,
      type: "variable",
    };
  });
}

function completeResultSetColumns(columnNames: string[], syntaxNodeName: string) {
  return columnNames.map((col) => {
    const hasSurround =
      syntaxNodeName === "ResultSetColumn" || syntaxNodeName === "ResultSetColumnName";
    const apply = hasSurround ? col : `{${col}}`;
    return {
      label: col,
      type: "variable",
      apply,
    };
  });
}

function newColumnCompletionSource(lookup: Map<string, string[]>, functionNames: string[]) {
  const functionOptions = makeFunctionOptions(functionNames);
  // Pre-compute table options for top-level contexts (outside Column/ObjectName)
  const topLevelTableOptions = completeTables(lookup, "Identifier");

  return (context: CompletionContext): CompletionResult | null => {
    const tree = syntaxTree(context.state);
    const syntaxNode = tree.resolve(context.pos, -1);
    const word = context.matchBefore(/\w*/);

    if (!word) {
      return null;
    }

    // For top-level identifiers with empty input, require explicit activation
    if (
      word.from === word.to &&
      !context.explicit &&
      (syntaxNode.name === "Identifier" || syntaxNode.name === "⚠")
    ) {
      return null;
    }

    switch (syntaxNode.name) {
      case "Column": {
        const children = syntaxNode.getChildren("ObjectName");
        switch (children.length) {
          case 0:
            return {
              from: syntaxNode.from + 1,
              options: completeTables(lookup, syntaxNode.name),
              validFor: VALID_FOR_OBJECT_NAME,
            };
          case 1:
            // When there's exactly 1 ObjectName (table name), the user is in
            // the column name position (after the /). The from position should
            // be after the table name and slash, not at the start of the table.
            return {
              from: children[0].to + 1,
              options: completeColumns(context, lookup, children[0]),
              validFor: VALID_FOR_OBJECT_NAME,
            };
          default:
            return {
              from: syntaxNode.from,
              options: [],
              validFor: VALID_FOR_OBJECT_NAME,
            };
        }
      }
      case "ObjectName": {
        const prevSibling = syntaxNode.prevSibling;
        if (prevSibling?.name === "ObjectName") {
          const options = completeColumns(context, lookup, prevSibling);
          return {
            from: syntaxNode.from,
            options,
            validFor: VALID_FOR_OBJECT_NAME,
          };
        }
        const options = completeTables(lookup, syntaxNode.name);
        return {
          from: syntaxNode.from,
          options,
          validFor: VALID_FOR_OBJECT_NAME,
        };
      }
      case "⚠":
      case "Identifier":
        return {
          from: syntaxNode.from,
          options: [...topLevelTableOptions, ...functionOptions, ...BOOLEAN_OPTIONS],
          validFor: VALID_FOR_IDENTIFIER,
        };
    }

    return null;
  };
}

function newResultSetColumnCompletionSource(resultSetColumns: string[], functionNames: string[]) {
  const functionOptions = makeFunctionOptions(functionNames);
  // Pre-compute result set column options for top-level contexts
  const topLevelResultSetOptions = completeResultSetColumns(resultSetColumns, "Identifier");
  // Pre-compute options for inside ResultSetColumn brackets
  const bracketResultSetOptions = completeResultSetColumns(resultSetColumns, "ResultSetColumn");

  return (context: CompletionContext): CompletionResult | null => {
    const tree = syntaxTree(context.state);
    const syntaxNode = tree.resolve(context.pos, -1);
    const word = context.matchBefore(/\w*/);

    if (!word) {
      return null;
    }

    switch (syntaxNode.name) {
      case "ResultSetColumn":
        if (syntaxNode.getChildren("ResultSetColumnName").length >= 1) {
          break;
        }
        return {
          from: word.from,
          options: bracketResultSetOptions,
          validFor: VALID_FOR_RESULT_SET_COLUMN_NAME,
        };
      case "ResultSetColumnName":
        return {
          from: word.from,
          options: bracketResultSetOptions,
          validFor: VALID_FOR_RESULT_SET_COLUMN_NAME,
        };
      case "Identifier":
      case "Formula":
        return {
          from: word.from,
          options: [...topLevelResultSetOptions, ...functionOptions, ...BOOLEAN_OPTIONS],
          validFor: VALID_FOR_IDENTIFIER,
        };
    }

    return null;
  };
}

const START_COMPLETION_SUFFIXES = ["/]", "/"];
const MOVE_CURSOR_SUFFIXES = new Set(["/]", "()"]);

const autoCompleteCursor = EditorState.transactionFilter.of((tr) => {
  const pickedTx = tr.annotation(pickedCompletion);
  if (pickedTx === undefined || tr.selection === undefined) {
    return tr;
  }
  const appliedString = typeof pickedTx.apply === "string" ? pickedTx.apply : "";
  const shouldMoveCursor = MOVE_CURSOR_SUFFIXES.has(appliedString.slice(-2));
  if (shouldMoveCursor) {
    const moveCursor: TransactionSpec = {
      sequential: true,
      selection: { anchor: tr.selection.main.anchor - 1 },
    };
    return [tr, moveCursor];
  }
  return tr;
});

const autoCompleteStart = EditorView.updateListener.of((update) => {
  for (const tr of update.transactions) {
    const annotation = tr.annotation(pickedCompletion);
    if (annotation === undefined) {
      continue;
    }
    const apply = annotation.apply;
    if (typeof apply !== "string") {
      continue;
    }
    if (START_COMPLETION_SUFFIXES.some((s) => apply.endsWith(s))) {
      startCompletion(update.view);
      break;
    }
  }
});

export type AutocompleteConfig =
  | {
      isFilter: false;
      lookup: Map<string, string[]>;
      functionNames: string[];
    }
  | {
      isFilter: true;
      resultSetColumns: string[];
      functionNames: string[];
    };

function newAutocompleteExtension(config: AutocompleteConfig) {
  if (config.isFilter) {
    const autoComplete = formulaLanguage.data.of({
      autocomplete: newResultSetColumnCompletionSource(
        config.resultSetColumns,
        config.functionNames,
      ),
    });
    return [autoComplete, autoCompleteCursor];
  }

  const autoComplete = formulaLanguage.data.of({
    autocomplete: newColumnCompletionSource(config.lookup, config.functionNames),
  });
  return [autoComplete, autoCompleteCursor, autoCompleteStart];
}

export { newColumnCompletionSource, newResultSetColumnCompletionSource, newAutocompleteExtension };
