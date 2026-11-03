import { getExampleGraph } from "../fixtures/graph.js";
import { TypeChecker } from "@chartzap/core/typechecker";
import { assert, describe, expect, test } from "vitest";

const graph = getExampleGraph("northwind");

describe("type checking a column", () => {
  test("indicates if the formula does not parse", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("$#%!");

    expect(result.status).toBe("parse-error");
  });

  test("simple valid formula outputs no type errors", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("123 + 456");

    expect(result.status).toBe("ok");
  });

  test("fails if a result set column is referenced", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(`{Total sales} / {Number of customers}`);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toContainEqual({
      message: "Cannot use a result set column here (Total sales)",
      from: 0,
      to: 13,
    });
    expect(result.errors).toContainEqual({
      message: "Cannot use a result set column here (Number of customers)",
      from: 16,
      to: 37,
    });
  });

  test("invalid equality check outputs a type error", () => {
    const formulaText = `"some text" = 123`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: "Cannot check equality of text and number",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("comparing text and number for equality outputs a type error", () => {
    const formulaText = `"some text" <> 123`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: "Cannot check equality of text and number",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("attempt to compare non numbers outputs a type error", () => {
    const examples = [
      `"some text" >= 123`,
      `123 >= "some text"`,
      `false > "some text"`,
      `123 < true`,
    ];

    examples.forEach((formulaText) => {
      const checker = new TypeChecker({ context: "column", graph });

      const result = checker.checkColumn(formulaText);

      assert(result.status === "typecheck-failed");
      expect(result.errors).toEqual([
        {
          message: expect.any(String),
          from: 0,
          to: formulaText.length,
        },
      ]);
    });
  });

  test("invalid number function arguments outputs a type error", () => {
    const formulaText = `Sum()`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: "Sum expects at least 1 arguments, but 0 were given",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("functions with a generic return type can be type checked", () => {
    const formulaText = `IF(SUM([Products/units_in_stock]) > 0 OR SUM([Products/units_on_order]) > 0, "Stocked or on order", "Out of stock")`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    expect(result.status).toBe("ok");
  });

  test("functions with generic argument types can output type errors", () => {
    const formulaText = `IF(false, 123, "some text")`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: `The type of the "else" argument must match the "then" argument (number)`,
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("functions with a generic return type can output type errors", () => {
    const formulaText = `IF(false, "a", "b") + 123`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: "Cannot add text and number",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("an invalid function name outputs a type error", () => {
    const formulaText = `INVALID_FUNCTION_NAME()`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors).toEqual([
      {
        message: "Unknown function name INVALID_FUNCTION_NAME",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("a valid function name in lowercase outputs no type error", () => {
    const formulaText = `count([Products/product_name])`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    expect(result.status).toBe("ok");
  });

  test("a number comparison is typed as a boolean", () => {
    const formulaText = `[Products/units_in_stock] > 0`;
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(formulaText);

    assert(result.status === "ok");
    expect(result.columnType).toEqual("boolean");
  });

  test("valid formula with column reference", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Products/unit_price]");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("number");
    }
  });

  test("valid formula with SUM aggregate", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("SUM([Products/unit_price])");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("number");
      expect(result.isMeasure).toBe(true);
    }
  });

  test("valid formula with text column", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Products/product_name]");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("text");
    }
  });

  test("valid formula with date column", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Orders/order_date]");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("date");
    }
  });

  test("valid formula with arithmetic", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Order Details/unit_price] * [Order Details/quantity]");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("number");
    }
  });

  test("typecheck error for unknown column", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Products/nonexistent_column]");

    expect(result.status).toBe("typecheck-failed");
    if (result.status === "typecheck-failed") {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("not found");
    }
  });

  test("typecheck error for unknown table", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[UnknownTable/column]");

    expect(result.status).toBe("typecheck-failed");
    if (result.status === "typecheck-failed") {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test("typecheck error for type mismatch in arithmetic", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn("[Products/product_name] + [Products/unit_price]");

    expect(result.status).toBe("typecheck-failed");
    if (result.status === "typecheck-failed") {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot add");
    }
  });

  test("valid complex formula with IF", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const result = checker.checkColumn(
      'IF([Products/units_in_stock] > 0, "In Stock", "Out of Stock")',
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.columnType).toBe("text");
    }
  });

  describe("type checking aggregate functions", () => {
    test("cannot call another aggregate function", () => {
      const formulaText = `Count(Sum([Products/units_in_stock]))`;
      const checker = new TypeChecker({ context: "column", graph });

      const result = checker.checkColumn(formulaText);

      assert(result.status === "typecheck-failed");
      expect(result.errors).toEqual([
        {
          message: "Cannot call aggregate function Sum inside Count",
          from: expect.any(Number),
          to: expect.any(Number),
        },
      ]);
    });

    test("cannot call another aggregate function with nesting", () => {
      const formulaText = `Count(If(true, Sum([Products/units_in_stock]), 0))`;
      const checker = new TypeChecker({ context: "column", graph });

      const result = checker.checkColumn(formulaText);

      assert(result.status === "typecheck-failed");
      expect(result.errors).toEqual([
        {
          message: "Cannot call aggregate function Sum inside Count",
          from: expect.any(Number),
          to: expect.any(Number),
        },
      ]);
    });

    test("cannot call another aggregate nested inside each other multiple times", () => {
      const formulaText = `Count(Sum(Max([Products/units_in_stock])))`;
      const checker = new TypeChecker({ context: "column", graph });

      const result = checker.checkColumn(formulaText);

      assert(result.status === "typecheck-failed");
      expect(result.errors).toEqual([
        {
          message: "Cannot call aggregate function Max inside Sum",
          from: expect.any(Number),
          to: expect.any(Number),
        },
        {
          message: "Cannot call aggregate function Sum inside Count",
          from: expect.any(Number),
          to: expect.any(Number),
        },
      ]);
    });

    test("Cannot refer to multiple models in one aggregate function", () => {
      const formulaText = `SUM([Products/product_id] + [Orders/order_id])`;
      const checker = new TypeChecker({ context: "column", graph });

      const result = checker.checkColumn(formulaText);

      assert(result.status === "typecheck-failed");
      expect(result.errors).toEqual([
        {
          message: "Aggregate function SUM cannot refer to multiple models (Orders, Products)",
          from: expect.any(Number),
          to: expect.any(Number),
        },
      ]);
    });
  });
});

describe("type checking a formula with measure conditions", () => {
  test("passes if the conditions expression returns a boolean", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const formulaText = `COUNTIF([Products/units_in_stock], [Categories/category_name] = "Beverages")`;
    const result = checker.checkColumn(formulaText);

    expect(result.status).toBe("ok");
  });

  test("fails if the conditions expression does not return a boolean", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const formulaText = `COUNTIF([Products/units_in_stock], "Hello")`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toEqual([
      {
        message: "Argument 2 (condition) must be a boolean, but is a text",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("fails if an aggregate function is used in a condition argument", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const formulaText = `CountIf([Products/units_in_stock], Count([Categories/category_id]) > 10)`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors.map((e) => e.message)).toEqual([
      "Cannot call aggregate function Count inside CountIf",
    ]);
  });

  test("provides data about the condition applied to an aggregate function", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const formulaText = `COUNTIF([Products/units_in_stock], TRUE)`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "ok");
    expect(result.queryData.aggregates.length).toBe(1);
    const agg = result.queryData.aggregates[0];
    expect(agg.name).toBe("COUNTIF");
    expect(agg.condition).toMatchObject({
      nodeType: "scalar",
      value: true,
    });
  });

  test("fails if there are type errors in the condition", () => {
    const checker = new TypeChecker({ context: "column", graph });

    const formulaText = `COUNTIF([Products/units_in_stock], "Hello" > 123)`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed");
    expect(result.errors.map((e) => e.message)).toContain("Cannot compare text and number");
  });
});

describe("type checking a filter formula", () => {
  test("fails if the return value is not boolean", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [],
    });

    const formulaText = `123 + 456`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toEqual([
      {
        message: "Must return a boolean. This formula returns a number.",
        from: 0,
        to: formulaText.length,
      },
    ]);
  });

  test("fails if a column is referenced", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [],
    });

    const formulaText = `[Products/units_in_stock] > 0`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toContainEqual({
      message: "Filters can only refer to columns in the result set",
      from: 0,
      to: 25,
    });
  });

  test("fails if an aggregate function is used", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [
        {
          name: "Total revenue",
          columnType: "number",
        },
      ],
    });

    const formulaText = `Sum({Total revenue}) > 0`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toContainEqual({
      message: "Cannot use aggregate functions like Sum in filter",
      from: 0,
      to: 20,
    });
  });

  test("passes if a result set column is referenced", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [
        {
          name: "Total revenue",
          columnType: "number",
        },
      ],
    });

    const formulaText = `{Total revenue} > 0`;
    const result = checker.checkColumn(formulaText);

    expect(result.status).toBe("ok");
  });

  test("fails if a missing result set column is reference", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [],
    });

    const formulaText = `{Total revenue} > 0`;
    const result = checker.checkColumn(formulaText);

    assert(result.status === "typecheck-failed", `Expected typecheck-failed, got ${result.status}`);
    expect(result.errors).toContainEqual({
      message: "Result set column {Total revenue} not found",
      from: 0,
      to: 15,
    });
  });

  test("passes with a more complex example", () => {
    const checker = new TypeChecker({
      context: "filter",
      resultSetColumns: [
        {
          name: "Total revenue",
          columnType: "number",
        },
        {
          name: "Number of customers",
          columnType: "number",
        },
      ],
    });

    const formulaText = `TRUNC({Total revenue}, 0) < 100 OR {Number of customers} < 10`;
    const result = checker.checkColumn(formulaText);

    expect(result.status).toBe("ok");
  });
});
