import type { Spec } from "../functions/index.js";

const textFunctions: Spec[] = [
  {
    name: "Concat",
    description: "Joins two or more text values together",
    args: [
      {
        name: "value",
        description: "Text to join together",
        typeMatch: { match: "is", type: "any" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "text",
    optionalArgs: 0,
    lastArgRepeats: true,
  },
  {
    name: "Upper",
    description: "Convert text to uppercase",
    args: [
      {
        name: "value",
        description: "Text to convert to uppercase",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "text",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Lower",
    description: "Convert text to lowercase",
    args: [
      {
        name: "value",
        description: "Text to convert to lowercase",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "text",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Contains",
    description: "Checks if text includes some other text",
    args: [
      {
        name: "text",
        description: "The text to search",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "search_text",
        description: "The text to search for",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "case_sensitive",
        description: "Whether to perform a case-sensitive search (default false)",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "boolean",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
  {
    name: "StartsWith",
    description: "Checks if text starts with some other text",
    args: [
      {
        name: "text",
        description: "The text to search",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "search_text",
        description: "The text to search for",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "case_sensitive",
        description: "Whether to perform a case-sensitive search (default false)",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "boolean",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
  {
    name: "EndsWith",
    description: "Checks if text ends with some other text",
    args: [
      {
        name: "text",
        description: "The text to search",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "search_text",
        description: "The text to search for",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "case_sensitive",
        description: "Whether to perform a case-sensitive search (default false)",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "boolean",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
  {
    name: "SplitPart",
    description: "Divide text into multiple parts and return a specific part",
    args: [
      {
        name: "text",
        description: "The text to split",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "delimiter",
        description: "The character or text to split on",
        typeMatch: { match: "is", type: "text" },
        type: "standard",
      },
      {
        name: "index",
        description: "The number of the part to return. Defaults to 1, which is the first part.",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "text",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
];

export { textFunctions };
