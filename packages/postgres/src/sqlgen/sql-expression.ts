import type { AST, FunctionCall } from "@chartzap/core/formula/ast";
import { binaryOperators } from "@chartzap/core/formula/ast";
import { functionLookup } from "@chartzap/core/functions";
import type { FunctionName } from "@chartzap/core/functions";
import type { Graph } from "@chartzap/core/schema/graph";
import invariant from "tiny-invariant";

interface Context {
  graph: Graph;
  parameters?: (string | number | boolean)[];
}

function sqlExpression(f: AST, context: Context): string {
  switch (f.nodeType) {
    case "functionCall": {
      const func = functionLookup(f.name);
      invariant(func !== undefined, `function ${f.name} not found`);
      const customWriter = customFuncWriters.get(func.name);
      return customWriter ? customWriter(f, context) : simpleFunc(f, context);
    }
    case "binaryExpression": {
      invariant(f.left !== undefined);
      invariant(f.right !== undefined);
      invariant(f.expressionType !== undefined);
      const operator = binaryOperators[f.expressionType];
      invariant(operator !== undefined);

      const left = sqlExpression(f.left, context);
      let right: string;

      if (operator === "/") {
        right = sql(context)`NULLIF(${f.right}, 0)`;
      } else {
        right = sqlExpression(f.right, context);
      }

      return `(${left} ${operator} ${right})`;
    }
    case "column": {
      const graphNode = context.graph.getNodeByName(f.graphNode);
      const column = context.graph.getColumnByName(graphNode.id, f.columnName);
      return [column.relation.tableName, column.name].map(doubleQuote).join(".");
    }
    case "aggColumn":
      return [f.relationName, f.columnName].map(doubleQuote).join(".");
    case "resultSetColumn":
      return doubleQuote(f.columnName);
    case "scalar":
      if (context.parameters) {
        context.parameters.push(f.value);
        const cast =
          typeof f.value === "string"
            ? "text"
            : typeof f.value === "number"
              ? "numeric"
              : "boolean";
        return `$${context.parameters.length}::${cast}`;
      }
      if (typeof f.value === "string") {
        return singleQuote(f.value);
      }
      return f.value.toString().toUpperCase();
    default: {
      const exhaustive: never = f;
      throw new Error(String(exhaustive));
    }
  }
}

function doubleQuote(s: string): string {
  if (s.includes("\0")) throw new TypeError("PostgreSQL identifiers cannot contain NUL");
  const quoteChar = `"`;
  const escaped = s.replaceAll(quoteChar, `""`);
  return [quoteChar, escaped, quoteChar].join("");
}

function singleQuote(s: string): string {
  if (s.includes("\0")) throw new TypeError("PostgreSQL strings cannot contain NUL");
  const quoteChar = `'`;
  const escaped = s.replaceAll(quoteChar, `''`);
  return [quoteChar, escaped, quoteChar].join("");
}

function simpleFunc(f: FunctionCall<AST>, context: Context): string {
  const name = functionLookup(f.name)!.name.toUpperCase();
  return sql(context)`${name}(${f.args})`;
}

type SQLWriter = (f: FunctionCall<AST>, context: Context) => string;
type CustomFuncWriters = Map<string, SQLWriter>;

const customFuncWriters: CustomFuncWriters = new Map();

function registerCustomFuncWriter(funcName: FunctionName, writer: SQLWriter): void {
  customFuncWriters.set(funcName, writer);
}

// Aggregate function writers
registerCustomFuncWriter("AvgIf", (f, context) => {
  return sql(context)`AVG(${f.args[0]})`;
});

registerCustomFuncWriter("CountIf", (f, context) => {
  return sql(context)`COUNT(${f.args[0]})`;
});

registerCustomFuncWriter("CountDistinct", (f, context) => {
  return sql(context)`COUNT(DISTINCT ${f.args[0]})`;
});

registerCustomFuncWriter("CountDistinctIf", (f, context) => {
  return sql(context)`COUNT(DISTINCT ${f.args[0]})`;
});

registerCustomFuncWriter("MaxIf", (f, context) => {
  return sql(context)`MAX(${f.args[0]})`;
});

registerCustomFuncWriter("MinIf", (f, context) => {
  return sql(context)`MIN(${f.args[0]})`;
});

registerCustomFuncWriter("SumIf", (f, context) => {
  return sql(context)`SUM(${f.args[0]})`;
});

registerCustomFuncWriter("Percentile", (f, context) => {
  return sql(context)`PERCENTILE_CONT(${f.args[1]}) WITHIN GROUP (ORDER BY ${f.args[0]})`;
});

registerCustomFuncWriter("Median", (f, context) => {
  return sql(context)`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${f.args[0]})`;
});

registerCustomFuncWriter("Mode", (f, context) => {
  return sql(context)`MODE() WITHIN GROUP (ORDER BY ${f.args[0]})`;
});

// String matching functions
function makeStringMatcherFunc(getMatchString: (ast: AST, context: Context) => string): SQLWriter {
  return (f: FunctionCall<AST>, context: Context) => {
    const matcher = getMatchString(f.args[1], context);
    const lastArg = f.args[2];
    let caseSensitive: boolean;

    if (lastArg === undefined) {
      caseSensitive = false;
    } else if (lastArg.nodeType === "scalar") {
      caseSensitive = lastArg.value === true;
    } else {
      // Last argument is not a scalar and needs to be interpreted by the database.
      return sql(context)`CASE WHEN ${lastArg} THEN
      ${f.args[0]} LIKE ${matcher}
    ELSE
      ${f.args[0]} ILIKE ${matcher}
    END`;
    }

    const operator = caseSensitive ? "LIKE" : "ILIKE";

    return sql(context)`${f.args[0]} ${operator} ${matcher}`;
  };
}

registerCustomFuncWriter(
  "Contains",
  makeStringMatcherFunc((arg, context) => {
    return sql(context)`CONCAT('%', ${arg}, '%')`;
  }),
);

registerCustomFuncWriter(
  "StartsWith",
  makeStringMatcherFunc((arg, context) => {
    return sql(context)`CONCAT(${arg}, '%')`;
  }),
);

registerCustomFuncWriter(
  "EndsWith",
  makeStringMatcherFunc((arg, context) => {
    return sql(context)`CONCAT('%', ${arg})`;
  }),
);

// Date functions
registerCustomFuncWriter("DateAdd", (f, context) => {
  if (f.args[0].nodeType !== "scalar") {
    throw new Error("DateAdd requires a scalar as the first argument");
  }
  const scalar = f.args[0].value.toString().toLowerCase();
  invariant(
    ["year", "quarter", "month", "week", "day", "hour", "minute", "second"].includes(scalar),
    "Invalid date unit",
  );
  return sql(context)`(${f.args[2]} + (${f.args[1]}) * INTERVAL '1 ${scalar}')`;
});

registerCustomFuncWriter("DateDiff", (f, context) => {
  if (f.args[0].nodeType !== "scalar") {
    throw new Error("DateDiff requires a scalar as the first argument");
  }
  const scalar = f.args[0].value.toString().toLowerCase();
  invariant(
    ["year", "quarter", "month", "week", "day", "hour", "minute", "second"].includes(scalar),
    "Invalid date unit",
  );
  return sql(context)`EXTRACT(${scalar} FROM age(${f.args[2]}, ${f.args[1]}))`;
});

registerCustomFuncWriter("Day", (f, context) => {
  return sql(context)`EXTRACT(day FROM ${f.args[0]})`;
});

registerCustomFuncWriter("Week", (f, context) => {
  return sql(context)`EXTRACT(week FROM ${f.args[0]})`;
});

registerCustomFuncWriter("Month", (f, context) => {
  return sql(context)`EXTRACT(month FROM ${f.args[0]})`;
});

registerCustomFuncWriter("Quarter", (f, context) => {
  return sql(context)`EXTRACT(quarter FROM ${f.args[0]})`;
});

registerCustomFuncWriter("Year", (f, context) => {
  return sql(context)`EXTRACT(year FROM ${f.args[0]})`;
});

registerCustomFuncWriter("Today", () => "current_date");

registerCustomFuncWriter("MakeDate", (f, context) => {
  return sql(context)`MAKE_DATE(${f.args[0]}::int, ${f.args[1]}::int, ${f.args[2]}::int)`;
});

// String functions
registerCustomFuncWriter("SplitPart", (f, context) => {
  return sql(context)`SPLIT_PART(${f.args[0]}, ${f.args[1]}, (${f.args[2]})::int)`;
});
registerCustomFuncWriter("Trunc", (f, context) => {
  return f.args.length === 1
    ? sql(context)`TRUNC(${f.args[0]}::numeric)`
    : sql(context)`TRUNC(${f.args[0]}::numeric, (${f.args[1]})::int)`;
});

// Logical functions
registerCustomFuncWriter("If", (f, context) => {
  return sql(context)`CASE WHEN ${f.args[0]} THEN ${f.args[1]} ELSE ${f.args[2]} END`;
});

registerCustomFuncWriter("IsNull", (f, context) => {
  return sql(context)`${f.args[0]} IS NULL`;
});

// Template helper for building SQL expressions
function sql(context: Context) {
  return (strings: TemplateStringsArray, ...args: (AST | AST[] | string)[]): string => {
    return strings
      .flatMap((s, i) => {
        const arg = args[i];
        if (arg) {
          if (typeof arg === "string") {
            return [s, arg];
          }
          if (Array.isArray(arg)) {
            const fragment = arg.map((a) => sqlExpression(a, context)).join(", ");
            return [s, fragment];
          }
          const fragment = sqlExpression(arg, context);
          return [s, fragment];
        }
        return s;
      })
      .join("");
  };
}

export { sqlExpression, doubleQuote, singleQuote };
export type { Context };
