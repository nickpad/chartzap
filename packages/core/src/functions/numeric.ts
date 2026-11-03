import type { Spec } from "../functions/index.js";

const numericFunctions: Spec[] = [
  {
    name: "Abs",
    description: "Returns the absolute value of a number",
    args: [
      {
        name: "value",
        description: "The number to return the absolute value of",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Ceiling",
    description: "Rounds a number up to the nearest integer",
    args: [
      {
        name: "value",
        description: "The number to round up",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Floor",
    description: "Rounds a number down to the nearest integer",
    args: [
      {
        name: "value",
        description: "The number to round down",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Trunc",
    description: "Truncate a number towards zero",
    args: [
      {
        name: "value",
        description: "The number to round down",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
      {
        name: "places",
        description: "The number of decimal places to preserve (default is 0)",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
];

export { numericFunctions };
