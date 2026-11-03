import { Graph, GraphError } from "./graph.js";
import type { FieldType, GraphNodeID } from "./graph.js";

interface SchemaSeed {
  relations: {
    schema: string;
    name: string;
    primaryKeys: string[];
    columns: { name: string; type: FieldType }[];
  }[];
  graphNodes: {
    relation: string;
    name: string;
  }[];
  graphEdges: {
    fromNodeName: string;
    toNodeName: string;
    fromColumn: string;
    toColumn: string;
  }[];
}

function hydrateGraphFromSeed(seed: SchemaSeed): Graph {
  const graph = Graph.newEmpty();
  let relationId = 0;
  let columnId = 0;
  const nodesMap: Record<string, GraphNodeID> = {};

  for (const node of seed.graphNodes) {
    const relation = seed.relations.find((r) => {
      const qualified = `${r.schema}.${r.name}`;
      return node.relation === qualified;
    });

    if (relation === undefined) {
      throw new GraphError("INVALID_GRAPH", `Relation not found for node: ${node.relation}`);
    }

    const nodeId = graph.addNode(node.name, {
      id: relationId++,
      schema: relation.schema,
      tableName: relation.name,
      columns: relation.columns.map((c) => ({
        id: columnId++,
        name: c.name,
        dataType: c.type,
        isPrimaryKey: relation.primaryKeys.includes(c.name),
      })),
    });

    nodesMap[node.name] = nodeId;
  }

  for (const edge of seed.graphEdges) {
    const fromNodeId = nodesMap[edge.fromNodeName];
    const toNodeId = nodesMap[edge.toNodeName];
    const fromNode = graph.getNode(fromNodeId);
    const toNode = graph.getNode(toNodeId);
    const fromColumn = fromNode.relation.columns.find((c) => c.name === edge.fromColumn);
    const toColumn = toNode.relation.columns.find((c) => c.name === edge.toColumn);
    if (fromColumn === undefined || toColumn === undefined) {
      throw new GraphError(
        "COLUMN_NOT_FOUND",
        `fromColumn or toColumn not found for ${edge.fromNodeName} or ${edge.toNodeName}`,
      );
    }

    graph.addEdge(
      {
        nodeId: fromNode.id,
        columnId: fromColumn.id,
      },
      {
        nodeId: toNode.id,
        columnId: toColumn.id,
      },
    );
  }

  return graph;
}

export { type SchemaSeed, hydrateGraphFromSeed };
