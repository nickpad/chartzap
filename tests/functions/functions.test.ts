import assert from "node:assert";
import { functionArgLookup, functionLookup } from "@chartzap/core/functions";
import { describe, expect, test } from "vitest";

const getFunc = (name: string) => {
  const func = functionLookup(name);
  assert(func !== undefined);
  return func;
};

describe("basic function with one argument", () => {
  test("has no type errors when the argument types are valid", () => {
    const func = getFunc("Count");

    const result = func.typeCheck([{ type: "number" }]);

    expect(result.errors).toEqual([]);
  });

  test("provides its return type", () => {
    const func = getFunc("Sum");

    const result = func.typeCheck([{ type: "number" }]);

    expect(result.returnType).toEqual("number");
  });

  test("has a type error when too many arguments are given", () => {
    const func = getFunc("Count");

    const result = func.typeCheck([{ type: "number" }, { type: "number" }]);

    expect(result.errors).toEqual(["Count only accepts 1 arguments, but 2 were given"]);
  });
});

describe("function with an optional argument", () => {
  test("allows omitting the optional argument", () => {
    const func = getFunc("Percentile");

    const result = func.typeCheck([{ type: "number" }, { type: "number" }]);

    expect(result.errors).toEqual([]);
  });

  test("allows supplying the optional argument", () => {
    const func = getFunc("Percentile");

    const result = func.typeCheck([{ type: "number" }, { type: "number" }, { type: "boolean" }]);

    expect(result.errors).toEqual([]);
  });
});

describe("if function", () => {
  test("return type depends on arguments", () => {
    const func = getFunc("If");

    const first = func.typeCheck([{ type: "boolean" }, { type: "number" }, { type: "number" }]);
    const second = func.typeCheck([{ type: "boolean" }, { type: "text" }, { type: "text" }]);

    expect([first.returnType, second.returnType]).toEqual(["number", "text"]);
  });

  test("returns a type error if then and else types mismatch", () => {
    const func = getFunc("If");

    const result = func.typeCheck([{ type: "boolean" }, { type: "text" }, { type: "number" }]);

    expect(result.errors).toEqual([
      expect.stringContaining(
        `The type of the "else" argument must match the "then" argument (text)`,
      ),
    ]);
  });
});

describe("isnull function", () => {
  test("can accept any argument type", () => {
    const func = getFunc("IsNull");

    const result1 = func.typeCheck([{ type: "number" }]);
    const result2 = func.typeCheck([{ type: "text" }]);
    const result3 = func.typeCheck([{ type: "boolean" }]);

    expect(result1.errors).toEqual([]);
    expect(result2.errors).toEqual([]);
    expect(result3.errors).toEqual([]);
  });
});

describe("function with variable number of arguments", () => {
  test("allows any number of arguments", () => {
    const func = getFunc("Concat");

    const result = func.typeCheck([
      { type: "text" },
      { type: "text" },
      { type: "text" },
      { type: "text" },
      { type: "text" },
    ]);

    expect(result.errors).toEqual([]);
  });

  test("returns a type error if no arguments are given", () => {
    const func = getFunc("Concat");

    const result = func.typeCheck([]);

    expect(result.errors).toEqual([expect.stringContaining("Concat expects at least 1 argument")]);
  });
});

describe("function with optional arguments", () => {
  test("allows omitting the optional arguments", () => {
    const func = getFunc("Trunc");

    const result = func.typeCheck([{ type: "number" }]);

    expect(result.errors).toEqual([]);
  });

  test("allows providing the optional arguments", () => {
    const func = getFunc("Trunc");

    const result = func.typeCheck([{ type: "number" }, { type: "number" }]);

    expect(result.errors).toEqual([]);
  });
});

describe("functionArgLookup", () => {
  test("throws error if function does not exist", () => {
    expect(() => functionArgLookup("INVALID_FUNCTION_NAME", 0)).toThrow();
  });

  test("returns arg given a valid argument number", () => {
    const result = functionArgLookup("Count", 0);
    expect(result.arg.name).toEqual("field");
  });

  test("throws error if argument number is out of range", () => {
    expect(() => functionArgLookup("Floor", 1)).toThrow();
  });

  test("understands that some functions accept a variable number of arguments", () => {
    const result = functionArgLookup("Concat", 3);
    expect(result.arg.name).toEqual("value");
  });

  test("also provides function definition for convenience", () => {
    const result = functionArgLookup("Concat", 0);
    expect(result.func.name).toEqual("Concat");
  });
});
