import { compileAST, parseFormulaOrThrow } from "@chartzap/core/formula/compile";
import { expect, test } from "vitest";

test("invalid formula", () => {
  const formulaText = `ThisIsWrong OR 123--ABC`;

  const result = compileAST(formulaText);

  expect(result.isValid).toEqual(false);
});

test("compiling a simple formula to AST", async () => {
  const formulaText = `[Products/on_order]`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toEqual({
    id: 0,
    nodeType: "column",
    graphNode: "Products",
    columnName: "on_order",
    meta: {
      from: 0,
      to: formulaText.length,
    },
  });
});

test("compiling a formula with boolean keywords to AST", async () => {
  const formulaText = `[Products/in_stock] = true`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toMatchObject({
    nodeType: "binaryExpression",
    expressionType: "Equal",
    left: {
      nodeType: "column",
      graphNode: "Products",
      columnName: "in_stock",
    },
    right: {
      nodeType: "scalar",
      value: true,
    },
  });
});

test("compiling a formula with a function call to AST", async () => {
  const formulaText = `COUNT([Products/id])`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toMatchObject({
    nodeType: "functionCall",
    name: "COUNT",
    args: [
      {
        nodeType: "column",
        graphNode: "Products",
        columnName: "id",
        arg: {
          funcName: "COUNT",
          number: 0,
        },
      },
    ],
    meta: {
      from: 0,
      to: formulaText.length,
    },
  });
});

test("function call argument are annotated", async () => {
  const formulaText = `CONTAINS([Products/product_name], "Coffee")`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toMatchObject({
    nodeType: "functionCall",
    name: "CONTAINS",
    args: [
      {
        nodeType: "column",
        graphNode: "Products",
        columnName: "product_name",
        arg: {
          funcName: "CONTAINS",
          number: 0,
        },
      },
      {
        nodeType: "scalar",
        value: "Coffee",
        arg: {
          funcName: "CONTAINS",
          number: 1,
        },
      },
    ],
  });
});

test("compiling a formula with a result set column", async () => {
  const formulaText = `{Total sales} > 0`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toMatchObject({
    nodeType: "binaryExpression",
    expressionType: "GreaterThan",
    left: {
      nodeType: "resultSetColumn",
      columnName: "Total sales",
    },
    right: {
      nodeType: "scalar",
      value: 0,
    },
  });
});

test("compiling a complex formula to AST", async () => {
  const formulaText = `IF(SUM([Products/units_in_stock]) > 0 OR SUM([Products/units_on_order]) > 0, "Stocked or on order", "Out of stock")`;

  const formula = parseFormulaOrThrow(formulaText);

  expect(formula).toMatchObject({
    nodeType: "functionCall",
    name: "IF",
    args: [
      {
        nodeType: "binaryExpression",
        expressionType: "Or",
        left: {
          nodeType: "binaryExpression",
          expressionType: "GreaterThan",
          left: {
            nodeType: "functionCall",
            name: "SUM",
            args: [
              {
                nodeType: "column",
                graphNode: "Products",
                columnName: "units_in_stock",
              },
            ],
          },
          right: {
            nodeType: "scalar",
            value: 0,
          },
        },
        right: {
          nodeType: "binaryExpression",
          expressionType: "GreaterThan",
          left: {
            nodeType: "functionCall",
            name: "SUM",
            args: [
              {
                nodeType: "column",
                graphNode: "Products",
                columnName: "units_on_order",
              },
            ],
          },
          right: {
            nodeType: "scalar",
            value: 0,
          },
        },
      },
      {
        nodeType: "scalar",
        value: "Stocked or on order",
      },
      {
        nodeType: "scalar",
        value: "Out of stock",
      },
    ],
  });
});
