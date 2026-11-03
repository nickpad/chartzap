import type { Spec } from "../functions/index.js";

const aggregateFunctions: Spec[] = [
  {
    name: "Count",
    description: "Counts the number of non-null values",
    args: [
      {
        name: "field",
        description: "The name of the field to count",
        typeMatch: { match: "is", type: "any" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
    aggregateDefault: 0,
  },
  {
    name: "CountIf",
    description: "Counts the number of non-null values that meet a condition",
    args: [
      {
        name: "field",
        description: "The name of the field to count",
        typeMatch: { match: "is", type: "any" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test. If true, the value will be counted.",
        type: "condition",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
    aggregateDefault: 0,
  },
  {
    name: "CountDistinct",
    description: "Counts the number of distinct (unique) values in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to count",
        typeMatch: { match: "is", type: "any" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "CountDistinctIf",
    description: "Counts the number of unique values in a column for which a condition is true",
    args: [
      {
        name: "field",
        description: "The name of the field to count. Duplicate or empty values are skipped.",
        typeMatch: { match: "is", type: "any" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test. If true, the row will be counted.",
        typeMatch: { match: "is", type: "any" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Sum",
    description: "Sums the values in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to sum",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "SumIf",
    description: "Sums values in a column that meet a condition",
    args: [
      {
        name: "field",
        description: "The name of the field to sum",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test. If true, the value will be summed.",
        type: "condition",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Avg",
    description: "Finds the mean of the values in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to average",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "AvgIf",
    description: "Finds the mean of the values in a column that meed a condition",
    args: [
      {
        name: "field",
        description: "The name of the field to average",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test",
        type: "condition",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Min",
    description: "Finds the minimum value in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to find the minimum of",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "MinIf",
    description: "Finds the minimum value in a column that meets a condition",
    args: [
      {
        name: "field",
        description: "The name of the field to find the minimum of",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test",
        type: "condition",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Max",
    description: "Finds the maximum value in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to find the maximum of",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "MaxIf",
    description: "Finds the maximum value in a column that meets a condition",
    args: [
      {
        name: "field",
        description: "The name of the field to find the maximum of",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "condition",
        description: "The condition to test",
        type: "condition",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Mode",
    description: "Finds the most common value in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to find the most common value for",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Percentile",
    description: "Finds the nth percentile value",
    args: [
      {
        name: "field",
        description: "The name of the field to find the most common value for",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "percentile",
        description: "The percentile to find, between 0 and 1",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
      {
        name: "isDiscrete",
        description:
          "Whether to use discrete or continuous percentile calculation. Defaults to false.",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
  {
    name: "Median",
    description: "Finds the median value in a column",
    args: [
      {
        name: "field",
        description: "The name of the field to find the median of",
        typeMatch: { match: "is", type: "number" },
        type: "aggregate",
      },
      {
        name: "isDiscrete",
        description:
          "Whether to use discrete or continuous percentile calculation. Defaults to false.",
        typeMatch: { match: "is", type: "boolean" },
        type: "standard",
      },
    ],
    isAggregate: true,
    returnType: "number",
    optionalArgs: 1,
    lastArgRepeats: false,
  },
];

export { aggregateFunctions };
