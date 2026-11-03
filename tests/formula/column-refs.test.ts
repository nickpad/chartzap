import { resolveColumnIds, substituteColumnNames } from "@chartzap/core/formula/column-refs";
import { describe, expect, test } from "vitest";

const columns = [
  { id: "col_abc", displayName: "Revenue" },
  { id: "col_def", displayName: "Total Customers" },
  { id: "col_ghi", displayName: "Order Count" },
];

describe("resolveColumnIds", () => {
  test("resolves ID refs to display names", () => {
    const formula = "{#col_abc} > 100";
    const { formula: resolved, errors } = resolveColumnIds(formula, columns);

    expect(resolved).toBe("{Revenue} > 100");
    expect(errors).toEqual([]);
  });

  test("resolves multiple ID refs", () => {
    const formula = "{#col_abc} > 100 AND {#col_def} < 50";
    const { formula: resolved, errors } = resolveColumnIds(formula, columns);

    expect(resolved).toBe("{Revenue} > 100 AND {Total Customers} < 50");
    expect(errors).toEqual([]);
  });

  test("preserves name refs as-is", () => {
    const formula = "{Revenue} > 100";
    const { formula: resolved, errors } = resolveColumnIds(formula, columns);

    expect(resolved).toBe("{Revenue} > 100");
    expect(errors).toEqual([]);
  });

  test("reports error for unknown ID", () => {
    const formula = "{#col_unknown} > 100";
    const { formula: resolved, errors } = resolveColumnIds(formula, columns);

    expect(resolved).toBe("{#col_unknown} > 100");
    expect(errors).toEqual(['Column with ID "col_unknown" not found']);
  });

  test("handles formula with no refs", () => {
    const formula = "123 + 456";
    const { formula: resolved, errors } = resolveColumnIds(formula, columns);

    expect(resolved).toBe("123 + 456");
    expect(errors).toEqual([]);
  });

  test("handles empty formula", () => {
    const { formula: resolved, errors } = resolveColumnIds("", columns);

    expect(resolved).toBe("");
    expect(errors).toEqual([]);
  });
});

describe("substituteColumnNames", () => {
  test("substitutes display names with ID refs", () => {
    const formula = "{Revenue} > 100";
    const { formula: substituted, errors } = substituteColumnNames(formula, columns);

    expect(substituted).toBe("{#col_abc} > 100");
    expect(errors).toEqual([]);
  });

  test("substitutes multiple name refs", () => {
    const formula = "{Revenue} > 100 AND {Total Customers} < 50";
    const { formula: substituted, errors } = substituteColumnNames(formula, columns);

    expect(substituted).toBe("{#col_abc} > 100 AND {#col_def} < 50");
    expect(errors).toEqual([]);
  });

  test("preserves ID refs as-is", () => {
    const formula = "{#col_abc} > 100";
    const { formula: substituted, errors } = substituteColumnNames(formula, columns);

    expect(substituted).toBe("{#col_abc} > 100");
    expect(errors).toEqual([]);
  });

  test("reports error for unknown name", () => {
    const formula = "{Unknown Column} > 100";
    const { formula: substituted, errors } = substituteColumnNames(formula, columns);

    expect(substituted).toBe("{Unknown Column} > 100");
    expect(errors).toEqual(['Column "Unknown Column" not found']);
  });

  test("handles formula with no refs", () => {
    const formula = "123 + 456";
    const { formula: substituted, errors } = substituteColumnNames(formula, columns);

    expect(substituted).toBe("123 + 456");
    expect(errors).toEqual([]);
  });

  test("handles empty formula", () => {
    const { formula: substituted, errors } = substituteColumnNames("", columns);

    expect(substituted).toBe("");
    expect(errors).toEqual([]);
  });
});

describe("round-trip", () => {
  test("name -> ID -> name preserves formula", () => {
    const original = "{Revenue} > 100 AND {Order Count} < 10";

    const { formula: withIds } = substituteColumnNames(original, columns);
    const { formula: restored } = resolveColumnIds(withIds, columns);

    expect(restored).toBe(original);
  });
});
