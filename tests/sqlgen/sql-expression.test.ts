import { parseFormulaOrThrow } from "@chartzap/core/formula/compile";
import type { Graph } from "@chartzap/core/schema/graph";
import { hydrateGraphFromSeed } from "@chartzap/core/schema/seed";
import { northwind } from "../fixtures/northwind.js";
import { sqlExpression } from "../../packages/postgres/src/sqlgen/sql-expression.js";
import { beforeEach, expect, test } from "vitest";

let graph: Graph;

beforeEach(() => {
  graph = hydrateGraphFromSeed(northwind);
});

test("simple field reference", () => {
  const formulaText = `[Products/product_name]`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`"products"."product_name"`);
});

test("convert simple formula to SQL select clause text", () => {
  const formulaText = `CONCAT([Products/product_name])`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`CONCAT("products"."product_name")`);
});

test("create SQL text from nested formula", () => {
  const formulaText = `CONCAT(UPPER([Products/product_name]), " [", [Products/units_in_stock], "]")`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(
    `CONCAT(UPPER("products"."product_name"), ' [', "products"."units_in_stock", ']')`,
  );
});

test("create SQL text with binary expression with string and number literals", () => {
  const formulaText = `CONCAT("Min stock level: ", SUM([Products/units_in_stock]) * 0.7)`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`CONCAT('Min stock level: ', (SUM("products"."units_in_stock") * 0.7))`);
});

test("create SQL text with binary expression at top level", () => {
  const formulaText = `[Products/product_id] OR [Products/supplier_id]`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`("products"."product_id" OR "products"."supplier_id")`);
});

test("create SQL text with nested binary expression", () => {
  const formulaText = `[Products/units_in_stock] > 10 OR [Products/units_on_order] = 0`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(
    `(("products"."units_in_stock" > 10) OR ("products"."units_on_order" = 0))`,
  );
});

test("create SQL text containing boolean keyword", () => {
  const formulaText = `[Products/units_in_stock] = false`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`("products"."units_in_stock" = FALSE)`);
});

test("division uses NULLIF to prevent division by zero", () => {
  const formulaText = `[Products/units_in_stock] / [Products/units_on_order]`;
  const formula = parseFormulaOrThrow(formulaText);

  const sqlText = sqlExpression(formula, { graph });

  expect(sqlText).toEqual(`("products"."units_in_stock" / NULLIF("products"."units_on_order", 0))`);
});
