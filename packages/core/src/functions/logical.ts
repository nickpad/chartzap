import type { Spec } from "../functions/index.js";

const logicalFunctions: Spec[] = [
  {
    name: "If",
    description: "Returns one of two values depending on a condition",
    args: [
      {
        name: "condition",
        description: "The condition to test",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
      {
        name: "then",
        description: "The value to return if the condition is true",
        typeMatch: { match: "is", type: "any" },
        type: "standard",
      },
      {
        name: "else",
        description: "The value to return if the condition is false",
        typeMatch: {
          match: "is",
          type: "any",
          customChecker: (thisArg, allArgs) => {
            const thenArg = allArgs[1];
            if (thisArg.type !== thenArg.type) {
              return `The type of the "else" argument must match the "then" argument (${thenArg.type})`;
            }
          },
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: (givenArgs) => givenArgs[1].type,
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "IsNull",
    description: "Checks if a value is null",
    args: [
      {
        name: "value",
        description: "The value to check",
        typeMatch: { match: "is", type: "any" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "boolean",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Not",
    description: "Changes a boolean value to its opposite",
    args: [
      {
        name: "value",
        description: "The true or false value",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "boolean",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Coalesce",
    description: "Returns the value of the first non-null argument",
    args: [
      {
        name: "value",
        description: "Value to return if not null",
        typeMatch: {
          match: "is",
          type: "any",
          customChecker: (thisArg, allArgs, index) => {
            if (index > 0) {
              const prev = allArgs[index - 1];
              if (prev.type !== thisArg.type) {
                return "All arguments must be of the same type";
              }
            }
          },
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: (givenArgs) => givenArgs[0].type,
    optionalArgs: 0,
    lastArgRepeats: true,
  },
];

export { logicalFunctions };
