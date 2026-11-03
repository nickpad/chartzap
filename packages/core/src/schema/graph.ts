import { z } from "zod";

type FieldType = "text" | "number" | "date" | "datetime" | "boolean";

const nodeSchema = z.object({
  id: z.string().brand<"GraphNodeID">(),
  name: z.string(),
  relationId: z.number(),
});

const edgeSchema = z.object({
  id: z.string().brand<"GraphEdgeID">(),
  fromNodeId: z.string().brand<"GraphNodeID">(),
  fromColumnId: z.number(),
  toNodeId: z.string().brand<"GraphNodeID">(),
  toColumnId: z.number(),
});

const graphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

type GraphNode = z.infer<typeof nodeSchema>;
type GraphEdge = z.infer<typeof edgeSchema>;
type SerializedGraph = z.infer<typeof graphSchema>;
type GraphNodeID = GraphNode["id"];
type GraphEdgeID = GraphEdge["id"];

export type JoinPath = JoinItem[];

class ForeignKey {
  constructor(
    public nodeId: GraphNodeID,
    public columnId: number,
  ) {}

  hash(): number {
    return stringHashCode([this.nodeId, this.columnId].join());
  }
}

class Join {
  constructor(
    public left: ForeignKey,
    public right: ForeignKey,
    public edgeId: GraphEdgeID,
  ) {}

  hash(): number {
    return stringHashCode([this.left.hash(), this.right.hash()].join());
  }
}

class JoinItem {
  constructor(
    private join: Join,
    public index: number,
  ) {}

  static buildPath(joins: Join[]): JoinPath {
    return joins.map((j, idx) => new JoinItem(j, idx));
  }

  get joinId(): number {
    return this.join.hash();
  }

  get left(): ForeignKey {
    return this.join.left;
  }

  get right(): ForeignKey {
    return this.join.right;
  }

  get edgeId(): GraphEdgeID {
    return this.join.edgeId;
  }
}

interface Column {
  id: number;
  name: string;
  dataType: FieldType;
  isPrimaryKey: boolean;
}

interface Relation {
  id: number;
  schema: string;
  tableName: string;
  columns: Column[];
}

type GraphErrorCode =
  | "INVALID_GRAPH"
  | "DUPLICATE_NODE"
  | "AMBIGUOUS_JOIN_PATH"
  | "MISSING_PRIMARY_KEY"
  | "COLUMN_NOT_FOUND"
  | "NODE_NOT_FOUND"
  | "EDGE_NOT_FOUND"
  | "DISCONNECTED_NODES"
  | "UNSUPPORTED_TABLE_ALIAS";
class GraphError extends Error {
  constructor(
    public readonly code: GraphErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}
function invariant(condition: unknown, message = "Invalid graph"): asserts condition {
  if (!condition) throw new GraphError("INVALID_GRAPH", message);
}
function sequentialIds(): () => string {
  let id = 0;
  return () => `g${id++}`;
}
class ColumnNotFoundError extends GraphError {
  constructor(message: string) {
    super("COLUMN_NOT_FOUND", message);
    this.name = "ColumnNotFoundError";
  }
}

type IdGenerator = () => string;

class Graph {
  private nodes: Map<GraphNodeID, GraphNode> = new Map();
  private relations: Map<GraphNodeID, Relation> = new Map();
  private graph: Map<GraphNodeID, Join[]> = new Map();
  private nodesByName: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private idGenerator: IdGenerator;

  static newEmpty(idGenerator: IdGenerator = sequentialIds()) {
    return new Graph([], [], [], idGenerator);
  }

  static fromSerialized(
    object: unknown,
    relations: Relation[],
    idGenerator: IdGenerator = sequentialIds(),
  ) {
    const result = graphSchema.safeParse(object);
    if (!result.success) throw new GraphError("INVALID_GRAPH", "Invalid serialized graph");
    const serialized = result.data;
    return new Graph(serialized.nodes, serialized.edges, relations, idGenerator);
  }

  constructor(
    nodes: GraphNode[],
    edges: GraphEdge[],
    relations: Relation[],
    idGenerator: IdGenerator,
  ) {
    this.idGenerator = idGenerator;
    const relationIndex: Record<number, Relation> = {};
    for (const relation of relations) {
      relationIndex[relation.id] = relation;
    }
    for (const node of nodes) {
      this.#hydrateNode(node.id, node.name, relationIndex[node.relationId]);
    }
    for (const edge of edges) {
      this.#hydrateEdge(edge);
    }
  }

  serialize(): SerializedGraph {
    return {
      version: 1,
      nodes: this.allNodes(),
      edges: this.edges,
    };
  }

  private nextId(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = this.idGenerator();
      if (!this.nodes.has(id as GraphNodeID) && !this.edges.some((e) => e.id === id)) return id;
    }
    throw new GraphError("INVALID_GRAPH", "ID generator must produce unique IDs");
  }

  addNode(name: string, relation: Relation) {
    const existing = this.nodesByName.get(name);
    if (existing) {
      throw new GraphError("DUPLICATE_NODE", `Node ${name} already exists`);
    }
    const id = this.nextId() as GraphNodeID;
    this.#hydrateNode(id, name, relation);
    return id;
  }

  #hydrateNode(id: GraphNodeID, name: string, relation: Relation) {
    invariant(relation !== undefined, `Relation for node ${name} not found`);
    invariant(!this.nodes.has(id) && !this.nodesByName.has(name), `Duplicate node ${name}`);
    invariant(
      name.length > 0 && !name.includes("\0"),
      "Node names must be nonempty and contain no NUL characters",
    );
    invariant(
      !relation.schema.includes("\0") &&
        relation.tableName.length > 0 &&
        !relation.tableName.includes("\0"),
      "Invalid relation identifier",
    );
    invariant(
      new Set(relation.columns.map((c) => c.id)).size === relation.columns.length &&
        new Set(relation.columns.map((c) => c.name)).size === relation.columns.length,
      "Column IDs and names must be unique within a relation",
    );
    invariant(
      relation.columns.every((c) => c.name.length > 0 && !c.name.includes("\0")),
      "Invalid column identifier",
    );
    const node = { id, name, relationId: relation.id };
    this.nodes.set(id, node);
    this.nodesByName.set(name, node);
    this.relations.set(id, relation);
    this.graph.set(id, []);
  }

  addEdge(
    from: { nodeId: GraphNodeID; columnId: number },
    to: { nodeId: GraphNodeID; columnId: number },
  ) {
    return this.#hydrateEdge({
      id: this.nextId() as GraphEdgeID,
      fromNodeId: from.nodeId,
      fromColumnId: from.columnId,
      toNodeId: to.nodeId,
      toColumnId: to.columnId,
    });
  }

  #hydrateEdge(edge: GraphEdge) {
    const fromNode = this.nodes.get(edge.fromNodeId);
    const toNode = this.nodes.get(edge.toNodeId);
    invariant(fromNode !== undefined, `From node ${edge.fromNodeId} not found`);
    invariant(toNode !== undefined, `To node ${edge.toNodeId} not found`);
    const fromRelation = this.relations.get(fromNode.id);
    const toRelation = this.relations.get(toNode.id);
    invariant(fromRelation !== undefined, `From relation ${fromNode.relationId} not found`);
    invariant(toRelation !== undefined, `To relation ${toNode.relationId} not found`);
    const fromColumn = fromRelation.columns.find((c) => c.id === edge.fromColumnId);
    invariant(fromColumn !== undefined, `From column ${edge.fromColumnId} not found`);
    const toColumn = toRelation.columns.find((c) => c.id === edge.toColumnId);
    invariant(toColumn !== undefined, `To column ${edge.toColumnId} not found`);
    invariant(!this.edges.some((e) => e.id === edge.id), "Duplicate edge ID");
    invariant(fromColumn.dataType === toColumn.dataType, "Join columns must have the same type");
    const existing = this.joinPath(fromNode.id, toNode.id);
    if (fromNode.id === toNode.id || existing.length > 0) {
      throw new GraphError(
        "AMBIGUOUS_JOIN_PATH",
        "join path already exists: semantic graphs require a unique join path (no cycles or self joins)",
      );
    }
    const fromFK = new ForeignKey(fromNode.id, fromColumn.id);
    const toFK = new ForeignKey(toNode.id, toColumn.id);
    const forwardJoin = new Join(fromFK, toFK, edge.id);
    const reverseJoin = new Join(toFK, fromFK, edge.id);
    const forwardJoins = this.graph.get(fromNode.id);
    const reverseJoins = this.graph.get(toNode.id);
    invariant(forwardJoins !== undefined, `Forward joins for ${fromNode.id} not found`);
    invariant(reverseJoins !== undefined, `Reverse joins for ${toNode.id} not found`);
    forwardJoins.push(forwardJoin);
    reverseJoins.push(reverseJoin);
    this.edges.push(edge);
    return edge.id;
  }

  getNode(nodeId: GraphNodeID) {
    const node = this.nodes.get(nodeId);
    const relation = this.relations.get(nodeId);
    invariant(node !== undefined, `Node ${nodeId} not found`);
    invariant(relation !== undefined, `Relation for node ${nodeId} not found`);
    return Object.assign({}, node, { relation });
  }

  getNodeByName(name: string) {
    const node = this.nodesByName.get(name);
    if (!node) throw new GraphError("NODE_NOT_FOUND", `Node ${name} not found`);
    return this.getNode(node.id);
  }

  joinPath(fromNodeId: GraphNodeID, toNodeId: GraphNodeID): JoinPath {
    const previous: { [node: GraphNodeID]: Join } = {};
    const visited = new Set<GraphNodeID>();
    const queue: GraphNodeID[] = [];

    visited.add(fromNodeId);
    queue.push(fromNodeId);

    while (queue.length > 0) {
      const nodeId = queue.shift() as GraphNodeID;

      if (nodeId === toNodeId) {
        break;
      }

      const result = this.graph.get(nodeId);

      if (!result) {
        break;
      }

      for (const join of result) {
        const nextNodeId = join.right.nodeId;
        if (visited.has(nextNodeId)) {
          continue;
        }
        previous[nextNodeId] = join;
        queue.push(nextNodeId);
        visited.add(nextNodeId);
      }
    }

    const path: Join[] = [];
    let currentJoin = previous[toNodeId];
    while (currentJoin) {
      path.unshift(currentJoin);
      currentJoin = previous[currentJoin.left.nodeId];
    }
    return JoinItem.buildPath(path);
  }

  primaryKey(nodeId: GraphNodeID) {
    const node = this.getNode(nodeId);
    const columnNames = node.relation.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (columnNames.length === 0) {
      throw new GraphError("MISSING_PRIMARY_KEY", `Primary key not found for node ${node.name}`);
    }
    return { node, columnNames };
  }

  allNodes() {
    return Array.from(this.nodes.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  connectedNodes() {
    return this.allNodes().filter((n) => this.linkedNodes(n.id).length > 0);
  }

  isolatedNodes() {
    return this.allNodes().filter((n) => this.linkedNodes(n.id).length === 0);
  }

  getColumnByName(nodeId: GraphNodeID, columnName: string): Column & { relation: Relation } {
    const relation = this.relations.get(nodeId);
    invariant(relation !== undefined, `Relation for node ${nodeId} not found`);
    const columns = relation.columns;
    invariant(
      columns !== undefined,
      `Columns for table not found: "${relation.schema}"."${relation.tableName}"`,
    );
    const column = columns.find((f) => f.name === columnName);
    if (column === undefined) {
      throw new ColumnNotFoundError(`Column "${columnName}" not found`);
    }
    return {
      id: column.id,
      name: column.name,
      dataType: column.dataType as FieldType,
      isPrimaryKey: column.isPrimaryKey,
      relation,
    };
  }

  getColumnById(nodeId: GraphNodeID, columnId: number): Column & { relation: Relation } {
    const relation = this.relations.get(nodeId);
    invariant(relation !== undefined, `Relation for node ${nodeId} not found`);
    const column = relation.columns.find((c) => c.id === columnId);
    invariant(column !== undefined, `Column ${columnId} not found`);
    return Object.assign({}, column, { relation });
  }

  multiJoinPath(fromNodeId: GraphNodeID, toNodeIds: GraphNodeID[]): JoinPath {
    const joinItems = new Set<string>();
    const result: JoinItem[] = [];
    for (const e of toNodeIds) {
      const path = this.joinPath(fromNodeId, e);
      if (fromNodeId !== e && path.length === 0) {
        throw new GraphError("DISCONNECTED_NODES", "Referenced tables have no join path");
      }
      for (const item of path) {
        if (joinItems.has(item.edgeId)) {
          continue;
        }
        result.push(item);
        joinItems.add(item.edgeId);
      }
    }
    return result;
  }

  hasNode(nodeId: GraphNodeID) {
    return this.nodes.has(nodeId);
  }

  hasNodeByName(name: string) {
    return this.nodesByName.has(name);
  }

  linkedNodes(nodeId: GraphNodeID) {
    const joins = this.graph.get(nodeId);
    if (joins === undefined) {
      return [];
    }
    return joins.map((j) => {
      const node = this.getNode(j.right.nodeId);
      return {
        node,
        edgeId: j.edgeId,
      };
    });
  }

  removeNode(nodeId: GraphNodeID): void {
    const node = this.getNode(nodeId);

    // Remove edges
    for (const { edgeId } of this.linkedNodes(node.id)) {
      this.removeEdge(edgeId);
    }

    // Remove from nodes and nodesByName maps
    this.nodes.delete(node.id);
    this.nodesByName.delete(node.name);

    // Remove all joins where this node is involved
    this.graph.delete(node.id);

    // Remove any joins from other nodes that point to this node
    for (const [nodeId, joins] of this.graph) {
      const filteredJoins = joins.filter(
        (join) => join.left.nodeId !== node.id && join.right.nodeId !== node.id,
      );
      this.graph.set(nodeId, filteredJoins);
    }

    // Remove relation
    this.relations.delete(node.id);
  }

  removeEdge(edgeId: GraphEdgeID): void {
    // Remove from edges list
    this.edges = this.edges.filter((edge) => edge.id !== edgeId);

    // Check if edgeId exists in any joins
    let edgeExists = false;

    for (const joins of this.graph.values()) {
      if (joins.some((join) => join.edgeId === edgeId)) {
        edgeExists = true;
        break;
      }
    }

    if (!edgeExists) {
      throw new GraphError("EDGE_NOT_FOUND", `Edge with ID ${edgeId} not found in graph`);
    }

    // Remove joins with matching edgeId from all nodes
    for (const [nodeId, joins] of this.graph) {
      const filteredJoins = joins.filter((join) => join.edgeId !== edgeId);
      this.graph.set(nodeId, filteredJoins);
    }
  }

  isValid(): boolean {
    return this.validate().isValid;
  }

  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Get all nodes that have at least one connection
    const connectedNodes = this.connectedNodes();
    if (connectedNodes.length <= 1) {
      // Valid if 0 or 1 connected nodes (rest can be orphaned)
      return { isValid: true, errors: [] };
    }

    // Do an iterative depth-first search from the first connected node
    // to ensure we can reach all other connected nodes
    const startNode = connectedNodes[0];
    const visited = new Set<GraphNodeID>();
    const stack: GraphNodeID[] = [startNode.id];

    while (stack.length > 0) {
      const nodeId = stack.pop();

      // This should never happen as we check stack.length > 0
      if (nodeId === undefined) {
        break;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);

      for (const { node } of this.linkedNodes(nodeId)) {
        if (!visited.has(node.id)) {
          stack.push(node.id);
        }
      }
    }

    // Find any connected nodes that weren't reached in the DFS
    const unreachableNodes = connectedNodes.filter((node) => !visited.has(node.id));

    if (unreachableNodes.length > 0) {
      errors.push(
        `There are ${unreachableNodes.length} separate sets of linked nodes. In a valid graph all the nodes with links must connect together.`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Helper function to compute a string's hash code
function stringHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to a 32-bit integer
  }
  return hash;
}

export type {
  FieldType,
  GraphNode,
  GraphEdge,
  SerializedGraph,
  Relation,
  Join,
  JoinItem,
  GraphNodeID,
  GraphEdgeID,
};
export { Graph, GraphError, ColumnNotFoundError };
export type { GraphErrorCode };
