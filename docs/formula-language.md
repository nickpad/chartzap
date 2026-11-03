# Formula language

The checked-in grammar is the syntax contract for this pre-1.0 release. Function
lookup is case-insensitive. Semantic table, field, and result names are case-sensitive.

## Syntax

- A source column is `[Table/column]`; a result-set reference is `{Display name}`.
  Source columns are allowed in output formulas. Result references are allowed in
  result filters and refer to the output display name, not its optional SQL ID.
- Text uses double quotes. Escape an embedded double quote with a backslash.
  General JSON escapes such as backslash-n and backslash-backslash are not part of
  the grammar. Text cannot contain literal newlines. Escaped quotes are decoded
  in the AST before SQL parameter binding.
- In source identifiers, escape `/`, `[`, and `]` with a backslash. In result
  names, escape `{` and `}`. Escapes decode at the AST boundary. Spaces and
  punctuation inside names are preserved rather than trimmed.
- Numbers are integers or decimals, optionally negative. There is no exponent
  notation. Booleans accept `TRUE`, `True`, `true`, and the equivalent false forms.
- Function identifiers start with an ASCII letter and contain at least two
  characters: letters, digits, or underscores. The opening parenthesis must be
  adjacent to the name. Trailing commas are accepted in argument lists.
- `//` starts a line comment. Whitespace is allowed between expressions and
  operators, but not inside the structural parts of a column reference. Spaces
  inside the identifier itself remain meaningful.

## Operators

Precedence from highest to lowest, all left-associative:

| Level | Operators            | Types                                                |
| ----- | -------------------- | ---------------------------------------------------- |
| 1     | `*`, `/`             | number, number → number                              |
| 2     | `+`, `-`             | number, number → number                              |
| 3     | `<`, `<=`, `>`, `>=` | matching numbers or dates → boolean                  |
| 3     | `=`, `<>`            | matching numbers, dates, text, or booleans → boolean |
| 4     | `AND`, `OR`          | boolean, boolean → boolean                           |

`AND` and `OR` deliberately share a precedence level, unlike SQL. Use
parentheses when mixing them. The renderer preserves AST grouping. Not-equal
input is `<>`, not `!=`. Logical operators accept uppercase, lowercase, or
title case, not arbitrary mixed case. Unary logical negation is `NOT(value)`.
There is no general unary minus on an expression; a minus sign may prefix a
numeric literal. Division guards zero denominators with `NULLIF`.

## Types and aggregation

Formula types are `number`, `text`, `boolean`, `date`, `datetime`, and
`unknown` (used in diagnostics). The language has no null literal, array, object,
subquery, or arbitrary SQL escape hatch. Nulls may arrive from source data or
missing measures; SQL null behavior applies.

Dimensions describe grouped values. Measures contain aggregates. An aggregate
argument may combine columns from one semantic node and scalar functions.
Nested aggregates are rejected. Conditional variants take a boolean predicate
that may reference related nodes. The standalone query facade rejects aggregate
expressions with no source column and measures that mix bare source columns
with aggregates. Filter formulas must return boolean.

DateAdd adds the selected interval to its date; DateDiff uses PostgreSQL
`EXTRACT(unit FROM age(to, from))`, so it returns the selected calendar component
rather than a universal elapsed-unit count. DateAdd's historical type signature
is `date` although PostgreSQL interval arithmetic can return a timestamp.
String matching uses LIKE/ILIKE patterns: `%` and `_` retain wildcard meaning.
The optional third matching argument controls case sensitivity.

## Implemented catalogue (39 functions)

The signatures below come from the extracted declarative specifications. Optional
arguments end with `?`. Exact argument-type metadata is available through
`functions` and `functionLookup()`.

| Signature                                        | Role             | Meaning                                                                      |
| ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| `Abs(value)`                                     | Scalar/dimension | Returns the absolute value of a number                                       |
| `Ceiling(value)`                                 | Scalar/dimension | Rounds a number up to the nearest integer                                    |
| `Floor(value)`                                   | Scalar/dimension | Rounds a number down to the nearest integer                                  |
| `Trunc(value, places?)`                          | Scalar/dimension | Truncate a number towards zero                                               |
| `Concat(value, …)`                               | Scalar/dimension | Joins two or more text values together                                       |
| `Upper(value)`                                   | Scalar/dimension | Convert text to uppercase                                                    |
| `Lower(value)`                                   | Scalar/dimension | Convert text to lowercase                                                    |
| `Contains(text, search_text, case_sensitive?)`   | Scalar/dimension | Checks if text includes some other text                                      |
| `StartsWith(text, search_text, case_sensitive?)` | Scalar/dimension | Checks if text starts with some other text                                   |
| `EndsWith(text, search_text, case_sensitive?)`   | Scalar/dimension | Checks if text ends with some other text                                     |
| `SplitPart(text, delimiter, index)`              | Scalar/dimension | Divide text into multiple parts and return a specific part                   |
| `Count(field)`                                   | Measure          | Counts the number of non-null values                                         |
| `CountIf(field, condition)`                      | Measure          | Counts the number of non-null values that meet a condition                   |
| `CountDistinct(field)`                           | Measure          | Counts the number of distinct (unique) values in a column                    |
| `CountDistinctIf(field, condition)`              | Measure          | Counts the number of unique values in a column for which a condition is true |
| `Sum(field)`                                     | Measure          | Sums the values in a column                                                  |
| `SumIf(field, condition)`                        | Measure          | Sums values in a column that meet a condition                                |
| `Avg(field)`                                     | Measure          | Finds the mean of the values in a column                                     |
| `AvgIf(field, condition)`                        | Measure          | Finds the mean of the values in a column that meed a condition               |
| `Min(field)`                                     | Measure          | Finds the minimum value in a column                                          |
| `MinIf(field, condition)`                        | Measure          | Finds the minimum value in a column that meets a condition                   |
| `Max(field)`                                     | Measure          | Finds the maximum value in a column                                          |
| `MaxIf(field, condition)`                        | Measure          | Finds the maximum value in a column that meets a condition                   |
| `Mode(field)`                                    | Measure          | Finds the most common value in a column                                      |
| `Percentile(field, percentile, isDiscrete?)`     | Measure          | Finds the nth percentile value                                               |
| `Median(field, isDiscrete?)`                     | Measure          | Finds the median value in a column                                           |
| `If(condition, then, else)`                      | Scalar/dimension | Returns one of two values depending on a condition                           |
| `IsNull(value)`                                  | Scalar/dimension | Checks if a value is null                                                    |
| `Not(value)`                                     | Scalar/dimension | Changes a boolean value to its opposite                                      |
| `Coalesce(value, …)`                             | Scalar/dimension | Returns the value of the first non-null argument                             |
| `MakeDate(year, month, day)`                     | Scalar/dimension | Creates a date                                                               |
| `DateAdd(date_unit, number, date)`               | Scalar/dimension | Adds a number of date or time units to a date                                |
| `DateDiff(date_unit, from, to)`                  | Scalar/dimension | Calculates the length of time between two dates                              |
| `Day(date)`                                      | Scalar/dimension | Returns the day of the month                                                 |
| `Week(date)`                                     | Scalar/dimension | Returns the week number in the calendar year                                 |
| `Month(date)`                                    | Scalar/dimension | Returns the month number in the calendar year                                |
| `Quarter(date)`                                  | Scalar/dimension | Returns the quarter number in the calendar year                              |
| `Year(date)`                                     | Scalar/dimension | Returns the year from a date or datetime value                               |
| `Today()`                                        | Scalar/dimension | Returns the current date                                                     |

The historical name union also mentioned Div, Round, and Switch without function
specifications. They are not implemented or advertised in this release.
