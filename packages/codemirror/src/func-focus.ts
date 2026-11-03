import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Represents the function context at the cursor position.
 * - name: function identifier the cursor is inside
 * - argN: 0-based argument index, or undefined if cursor is on the function name
 */
interface FuncFocus {
  name: string;
  argN?: number;
}

/**
 * Detects which function call contains the cursor and which argument position.
 * For nested calls, returns the innermost enclosing function.
 *
 * Assumes FunctionCall node structure: [Identifier, ArgumentList]
 * where ArgumentList contains expressions separated by Comma nodes.
 */
function getFuncFocus(state: EditorState, pos: number): FuncFocus | undefined {
  const tree = syntaxTree(state);
  const node = tree.resolve(pos, 0);

  let callNode: typeof node | null = node;
  while (callNode && callNode.name !== "FunctionCall") {
    callNode = callNode.parent;
  }
  if (!callNode) return undefined;

  const nameNode = callNode.firstChild;
  const argsNode = callNode.lastChild;
  if (!nameNode || !argsNode) return undefined;

  const funcName = state.sliceDoc(nameNode.from, nameNode.to);

  const inArgs = pos > argsNode.from && pos <= argsNode.to;
  if (!inArgs) {
    return { name: funcName, argN: undefined };
  }

  let argIndex = 0;
  for (let child = argsNode.firstChild; child; child = child.nextSibling) {
    if (child.name === "Comma" && pos > child.from) {
      argIndex++;
    }
  }

  return { name: funcName, argN: argIndex };
}

const detectFuncFocus = (onFuncFocus: (f?: FuncFocus) => void) => {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      const pos = update.state.selection.main.head;
      onFuncFocus(getFuncFocus(update.state, pos));
    }
  });
};

export { type FuncFocus, detectFuncFocus, getFuncFocus };
