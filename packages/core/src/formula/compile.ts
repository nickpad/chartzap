import type { Tree } from "@lezer/common";

import { parser } from "./generated/formula.js";
import invariant from "tiny-invariant";

import type { AST } from "./ast.js";
import { binaryOperators } from "./ast.js";

type Result = { isValid: false } | { isValid: true; ast: AST };

type BinaryExpressionType = keyof typeof binaryOperators;

// Builders collect metadata during traversal; complete nodes are built on leave
type Builder =
  | {
      type: "functionCall";
      name: string;
      argsStartIndex: number;
      meta: { from: number; to: number };
    }
  | {
      type: "binaryExpression";
      expressionType?: BinaryExpressionType;
      meta: { from: number; to: number };
    }
  | {
      type: "column";
      graphNode?: string;
      columnName?: string;
      meta: { from: number; to: number };
    }
  | {
      type: "resultSetColumn";
      columnName?: string;
      meta: { from: number; to: number };
    };

function newIdSequence() {
  let currentId = 0;

  return () => {
    return currentId++;
  };
}

function compileAST(formula: string): Result {
  let tree: Tree;

  try {
    tree = parser.configure({ strict: true }).parse(formula);
  } catch {
    return { isValid: false };
  }

  const idSequence = newIdSequence();
  const builders: Builder[] = [];
  const results: AST[] = [];

  tree.iterate({
    enter: (ref) => {
      const text = formula.slice(ref.from, ref.to);
      const meta = { from: ref.from, to: ref.to };
      const builder = builders[builders.length - 1];

      switch (ref.name) {
        case "FunctionCall":
          builders.push({
            type: "functionCall",
            name: "unknown",
            argsStartIndex: results.length,
            meta,
          });
          break;
        case "Column":
          builders.push({ type: "column", meta });
          break;
        case "ResultSetColumn":
          builders.push({ type: "resultSetColumn", meta });
          break;
        case "BinaryExpression":
          builders.push({ type: "binaryExpression", meta });
          break;
        case "Text":
          results.push({
            id: idSequence(),
            nodeType: "scalar",
            value: text.slice(1, -1).replace(/\\"/g, '"'),
            meta,
          });
          break;
        case "Number":
          results.push({
            id: idSequence(),
            nodeType: "scalar",
            value: Number(text),
            meta,
          });
          break;
        case "True":
        case "False":
          results.push({
            id: idSequence(),
            nodeType: "scalar",
            value: text.toLowerCase() === "true",
            meta,
          });
          break;
        case "Multiply":
        case "Divide":
        case "Add":
        case "Subtract":
        case "LessThan":
        case "LessThanEqual":
        case "GreaterThan":
        case "GreaterThanEqual":
        case "Equal":
        case "NotEqual":
        case "And":
        case "Or":
          invariant(builder?.type === "binaryExpression", "expected binaryExpression builder");
          builder.expressionType = ref.name;
          break;
        case "Identifier":
          invariant(builder?.type === "functionCall", "expected functionCall builder");
          builder.name = text;
          break;
        case "ObjectName":
          invariant(builder?.type === "column", "expected column builder");
          if (builder.graphNode === undefined) {
            builder.graphNode = text.replace(/\\([/[\]])/g, "$1");
          } else {
            builder.columnName = text.replace(/\\([/[\]{}])/g, "$1");
          }
          break;
        case "ResultSetColumnName":
          invariant(builder?.type === "resultSetColumn", "expected resultSetColumn builder");
          builder.columnName = text.replace(/\\([/[\]{}])/g, "$1");
          break;
      }
    },
    leave: (ref) => {
      const builder = builders[builders.length - 1];

      switch (ref.name) {
        case "FunctionCall": {
          invariant(builder?.type === "functionCall", "expected functionCall builder");
          const args = results.splice(builder.argsStartIndex);
          // Add arg metadata to each argument
          for (let i = 0; i < args.length; i++) {
            args[i] = {
              ...args[i],
              arg: { funcName: builder.name, number: i },
            };
          }
          results.push({
            id: idSequence(),
            nodeType: "functionCall",
            name: builder.name,
            args,
            meta: builder.meta,
          });
          builders.pop();
          break;
        }
        case "BinaryExpression": {
          invariant(builder?.type === "binaryExpression", "expected binaryExpression builder");
          invariant(builder.expressionType !== undefined, "missing expressionType");
          const right = results.pop();
          const left = results.pop();
          invariant(left !== undefined && right !== undefined, "missing operands");
          results.push({
            id: idSequence(),
            nodeType: "binaryExpression",
            expressionType: builder.expressionType,
            left,
            right,
            meta: builder.meta,
          });
          builders.pop();
          break;
        }
        case "Column": {
          invariant(builder?.type === "column", "expected column builder");
          invariant(
            builder.graphNode !== undefined && builder.columnName !== undefined,
            "incomplete column",
          );
          results.push({
            id: idSequence(),
            nodeType: "column",
            graphNode: builder.graphNode,
            columnName: builder.columnName,
            meta: builder.meta,
          });
          builders.pop();
          break;
        }
        case "ResultSetColumn": {
          invariant(builder?.type === "resultSetColumn", "expected resultSetColumn builder");
          invariant(builder.columnName !== undefined, "incomplete resultSetColumn");
          results.push({
            id: idSequence(),
            nodeType: "resultSetColumn",
            columnName: builder.columnName,
            meta: builder.meta,
          });
          builders.pop();
          break;
        }
      }
    },
  });

  if (results.length !== 1) {
    return { isValid: false };
  }

  return { isValid: true, ast: results[0] };
}

function parseFormulaOrThrow(formula: string) {
  const result = compileAST(formula);

  if (result.isValid) {
    return result.ast;
  }

  throw new Error("invalid formula");
}

type StackAction = "enter" | "leave";

type StackMeta = "left" | "right" | "none";

interface StackItem {
  node: AST;
  action: StackAction;
  meta: StackMeta;
}

function walkAST(
  root: AST,
  callbacks: {
    enter: (node: AST, meta: StackMeta) => void;
    leave: (node: AST, meta: StackMeta) => void;
  },
) {
  const stack: StackItem[] = [{ node: root, action: "enter", meta: "none" }];

  while (stack.length > 0) {
    const { node, action, meta } = stack.pop()!;

    if (action === "enter") {
      // Call the enter callback
      callbacks.enter(node, meta);

      // Push the leave action for this node to the stack
      stack.push({ node, action: "leave", meta: "none" });

      let items: Omit<StackItem, "action">[] = [];

      switch (node.nodeType) {
        case "functionCall":
          items = node.args.map((a) => ({ node: a, meta: "none" }));
          break;
        case "binaryExpression":
          items = [
            { node: node.left, meta: "left" },
            { node: node.right, meta: "right" },
          ];
          break;
      }

      // Add the child nodes in reverse order
      for (let i = items.length - 1; i >= 0; i--) {
        stack.push(Object.assign({}, items[i], { action: "enter" as const }));
      }
    } else {
      // Call the leave callback
      callbacks.leave(node, meta);
    }
  }
}

function updateExpression(expr: AST, update: (node: AST) => AST): AST {
  const results: AST[] = [];

  walkAST(expr, {
    enter: (node) => {
      // Leaf nodes: transform and push immediately
      if (node.nodeType !== "functionCall" && node.nodeType !== "binaryExpression") {
        results.push(update(node));
      }
    },
    leave: (node) => {
      switch (node.nodeType) {
        case "functionCall": {
          const args = results.splice(results.length - node.args.length);
          const updated = update({ ...node, args });
          results.push(updated);
          break;
        }
        case "binaryExpression": {
          const right = results.pop()!;
          const left = results.pop()!;
          const updated = update({ ...node, left, right });
          results.push(updated);
          break;
        }
      }
    },
  });

  invariant(results.length === 1, "invalid expression");
  return results[0];
}

export { compileAST, parseFormulaOrThrow, walkAST, updateExpression };
