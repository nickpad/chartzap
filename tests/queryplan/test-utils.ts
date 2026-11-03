import type { CheckedColumn } from "../../packages/postgres/src/queryplan/index.js";
import type { Graph } from "@chartzap/core/schema/graph";
import { TypeChecker } from "@chartzap/core/typechecker";

interface ColumnInput {
  name: string;
  formula: string;
  sortDirection?: "asc" | "desc" | "none";
}

function buildCheckedColumns(columns: ColumnInput[], graph: Graph): CheckedColumn[] {
  const typechecker = new TypeChecker({ context: "column", graph });

  return columns.map((col) => {
    const result = typechecker.checkColumn(col.formula);

    if (result.status !== "ok") {
      throw new Error(`Type check failed for "${col.name}": ${result.status}`);
    }

    return {
      id: col.name, // Use name as id for test readability
      name: col.name,
      formula: col.formula,
      sortDirection: col.sortDirection ?? "none",
      expression: result.ast,
      isMeasure: result.isMeasure,
      columnType: result.columnType,
      aggregates: result.queryData.aggregates,
    };
  });
}

export { buildCheckedColumns };
export type { ColumnInput };
