import type { Spec } from "../functions/index.js";

const dateUnits = ["year", "quarter", "month", "week", "day"];

const timeUnits = ["hour", "minute", "second"];

const dateTimeUnits = [...dateUnits, ...timeUnits];

const dateTimeFunctions: Spec[] = [
  {
    name: "MakeDate",
    description: "Creates a date",
    args: [
      {
        name: "year",
        description: "An integer representing the year",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
      {
        name: "month",
        description: "An integer representing the month",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
      {
        name: "day",
        description: "An integer representing the day",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "date",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "DateAdd",
    description: "Adds a number of date or time units to a date",
    args: [
      {
        name: "date_unit",
        description: `The date or time unit to add. Can be one of: ${dateTimeUnits.join(", ")}`,
        typeMatch: {
          match: "literal",
          type: dateTimeUnits,
        },
        type: "standard",
      },
      {
        name: "number",
        description: "The number of date units to add",
        typeMatch: { match: "is", type: "number" },
        type: "standard",
      },
      {
        name: "date",
        description: "The date or datetime to add to",
        typeMatch: { match: "oneOf", type: ["date", "datetime"] },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "date",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "DateDiff",
    description: "Calculates the length of time between two dates",
    args: [
      {
        name: "date_unit",
        description: `The date or time unit to calculate in. Can be one of: ${dateTimeUnits.join(
          ", ",
        )}`,
        typeMatch: {
          match: "literal",
          type: dateTimeUnits,
        },
        type: "standard",
      },
      {
        name: "from",
        description: "The start date or datetime value",
        typeMatch: { match: "oneOf", type: ["date", "datetime"] },
        type: "standard",
      },
      {
        name: "to",
        description: "The end date or datetime value",
        typeMatch: { match: "oneOf", type: ["date", "datetime"] },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Day",
    description: "Returns the day of the month",
    args: [
      {
        name: "date",
        description: "The date or datetime value",
        typeMatch: {
          match: "oneOf",
          type: ["date", "datetime"],
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Week",
    description: "Returns the week number in the calendar year",
    args: [
      {
        name: "date",
        description: "The date or datetime value",
        typeMatch: {
          match: "oneOf",
          type: ["date", "datetime"],
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Month",
    description: "Returns the month number in the calendar year",
    args: [
      {
        name: "date",
        description: "The date or datetime value",
        typeMatch: {
          match: "oneOf",
          type: ["date", "datetime"],
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Quarter",
    description: "Returns the quarter number in the calendar year",
    args: [
      {
        name: "date",
        description: "The date or datetime value",
        typeMatch: {
          match: "oneOf",
          type: ["date", "datetime"],
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Year",
    description: "Returns the year from a date or datetime value",
    args: [
      {
        name: "date",
        description: "The date or datetime value",
        typeMatch: {
          match: "oneOf",
          type: ["date", "datetime"],
        },
        type: "standard",
      },
    ],
    isAggregate: false,
    returnType: "number",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
  {
    name: "Today",
    description: "Returns the current date",
    args: [],
    isAggregate: false,
    returnType: "date",
    optionalArgs: 0,
    lastArgRepeats: false,
  },
];

export { dateTimeFunctions };
