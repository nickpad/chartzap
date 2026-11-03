import type { SchemaSeed } from "@chartzap/core";
export const atelier: SchemaSeed = {
  relations: [
    {
      schema: "atelier",
      name: "studios",
      primaryKeys: ["id"],
      columns: [
        { name: "id", type: "number" },
        { name: "name", type: "text" },
        { name: "region", type: "text" },
      ],
    },
    {
      schema: "atelier",
      name: "orders",
      primaryKeys: ["id"],
      columns: [
        { name: "id", type: "number" },
        { name: "studio_id", type: "number" },
        { name: "total", type: "number" },
        { name: "fulfilled", type: "boolean" },
        { name: "ordered_on", type: "date" },
      ],
    },
    {
      schema: "atelier",
      name: "lines",
      primaryKeys: ["order_id", "position"],
      columns: [
        { name: "order_id", type: "number" },
        { name: "position", type: "number" },
        { name: "price", type: "number" },
        { name: "quantity", type: "number" },
      ],
    },
  ],
  graphNodes: [
    { name: "Studios", relation: "atelier.studios" },
    { name: "Orders", relation: "atelier.orders" },
    { name: "Lines", relation: "atelier.lines" },
  ],
  graphEdges: [
    { fromNodeName: "Studios", fromColumn: "id", toNodeName: "Orders", toColumn: "studio_id" },
    { fromNodeName: "Orders", fromColumn: "id", toNodeName: "Lines", toColumn: "order_id" },
  ],
};
export const exampleColumns = [
  { name: "Studio", formula: "[Studios/name]" },
  { name: "Revenue", formula: "SUM([Lines/price] * [Lines/quantity])" },
  { name: "Orders", formula: "COUNT([Orders/id])" },
];
