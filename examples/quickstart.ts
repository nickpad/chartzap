import { createSchemaGraph, createFormulaEngine } from "@chartzap/core";
import { postgres } from "@chartzap/postgres";
const graph = createSchemaGraph({
  relations: [
    {
      schema: "public",
      name: "sales",
      primaryKeys: ["id"],
      columns: [
        { name: "id", type: "number" },
        { name: "region", type: "text" },
        { name: "amount", type: "number" },
      ],
    },
  ],
  graphNodes: [{ name: "Sales", relation: "public.sales" }],
  graphEdges: [],
});
const engine = createFormulaEngine({ graph });
const result = engine.compileQuery({
  columns: [
    { name: "Region", formula: "[Sales/region]" },
    { name: "Revenue", formula: "SUM([Sales/amount])" },
  ],
  filter: "{Revenue} > 100",
  compiler: postgres(),
});
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
