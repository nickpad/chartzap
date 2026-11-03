import { getFuncFocus } from "../../packages/codemirror/src/func-focus.js";
import { describe, expect, test } from "vitest";

import { newDocState } from "./test-utils.js";

function focusAt(doc: string) {
  const { state, cursor } = newDocState(doc);
  return getFuncFocus(state, cursor);
}

describe("getFuncFocus", () => {
  describe("when not inside a function", () => {
    test("returns undefined for empty formula", () => {
      expect(focusAt("|")).toBeUndefined();
    });

    test("returns undefined for number literal", () => {
      expect(focusAt("12|3")).toBeUndefined();
    });

    test("returns undefined for column reference", () => {
      expect(focusAt("[Table/col|umn]")).toBeUndefined();
    });

    test("returns undefined for binary expression", () => {
      expect(focusAt("1 + |2")).toBeUndefined();
    });
  });

  describe("when cursor is on function name", () => {
    test("returns function name with undefined argN", () => {
      expect(focusAt("SU|M([Table/col])")).toEqual({
        name: "SUM",
        argN: undefined,
      });
    });
  });

  describe("when cursor is inside function arguments", () => {
    test("returns argN 0 for first argument", () => {
      expect(focusAt("SUM(|[Table/col])")).toEqual({
        name: "SUM",
        argN: 0,
      });
    });

    test("returns argN 0 when cursor is within first argument", () => {
      expect(focusAt("SUM([Table/col|])")).toEqual({
        name: "SUM",
        argN: 0,
      });
    });

    test("returns argN 0 for empty first argument", () => {
      expect(focusAt("SUM(|)")).toEqual({
        name: "SUM",
        argN: 0,
      });
    });

    test("returns argN 1 after first comma", () => {
      expect(focusAt("IF(TRUE, |1, 0)")).toEqual({
        name: "IF",
        argN: 1,
      });
    });

    test("returns argN 2 after second comma", () => {
      expect(focusAt("IF(TRUE, 1, |0)")).toEqual({
        name: "IF",
        argN: 2,
      });
    });

    test("returns argN 2 within third argument", () => {
      expect(focusAt('IF(TRUE, 1, "fal|se")')).toEqual({
        name: "IF",
        argN: 2,
      });
    });

    test("returns correct argN at closing paren", () => {
      expect(focusAt("IF(TRUE, 1, 0|)")).toEqual({
        name: "IF",
        argN: 2,
      });
    });
  });

  describe("with nested functions", () => {
    test("returns inner function when cursor is in nested call", () => {
      expect(focusAt("SUM(ABS(|[Table/col]))")).toEqual({
        name: "ABS",
        argN: 0,
      });
    });

    test("returns outer function when cursor is after nested call", () => {
      expect(focusAt("IF(ABS([Table/col]), |1, 0)")).toEqual({
        name: "IF",
        argN: 1,
      });
    });

    test("returns outer function when cursor is in outer argument", () => {
      expect(focusAt("SUM(IF(TRUE, [Table/a], [Table/b])|)")).toEqual({
        name: "SUM",
        argN: 0,
      });
    });
  });

  describe("with complex expressions", () => {
    test("handles function with column arguments", () => {
      expect(focusAt("SUMIF([Orders/amount], |[Orders/status] = 1)")).toEqual({
        name: "SUMIF",
        argN: 1,
      });
    });

    test("handles function with text arguments", () => {
      expect(focusAt('CONCAT("hello", |"world")')).toEqual({
        name: "CONCAT",
        argN: 1,
      });
    });

    test("handles function with numeric arguments", () => {
      expect(focusAt("ROUND([Table/value], 2|)")).toEqual({
        name: "ROUND",
        argN: 1,
      });
    });
  });

  describe("edge cases", () => {
    test("cursor right before comma stays in current arg", () => {
      expect(focusAt("IF(TRUE|, 1, 0)")).toEqual({
        name: "IF",
        argN: 0,
      });
    });

    test("cursor right after comma moves to next arg", () => {
      expect(focusAt("IF(TRUE,| 1, 0)")).toEqual({
        name: "IF",
        argN: 1,
      });
    });

    test("handles trailing comma", () => {
      expect(focusAt('CONCAT("a", "b",|)')).toEqual({
        name: "CONCAT",
        argN: 2,
      });
    });

    test("handles no-arg function with cursor inside parens", () => {
      expect(focusAt("TODAY(|)")).toEqual({
        name: "TODAY",
        argN: 0,
      });
    });

    test("cursor between nested call and comma", () => {
      expect(focusAt("IF(ABS([Table/col])|, 1, 0)")).toEqual({
        name: "IF",
        argN: 0,
      });
    });
  });
});
