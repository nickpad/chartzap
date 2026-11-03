import { Graph } from "@chartzap/core/schema/graph";
import type {
  FieldType,
  GraphEdgeID,
  GraphNodeID,
  JoinItem,
  Relation,
} from "@chartzap/core/schema/graph";
import invariant from "tiny-invariant";
import { describe, expect, test } from "vitest";

let columnIdSequence = 0;

const columnNames: Record<number, string> = {};

function makeColumn(name: string, dataType: string, isPrimaryKey = false) {
  const column = {
    id: columnIdSequence++,
    name,
    dataType: dataType as FieldType,
    isPrimaryKey,
  };
  columnNames[column.id] = column.name;
  return column;
}

function primaryKey() {
  return makeColumn("id", "number", true);
}

const TEST_RELATIONS: Relation[] = [
  {
    id: 1,
    schema: "public",
    tableName: "customers",
    columns: [primaryKey()],
  },
  {
    id: 2,
    schema: "public",
    tableName: "orders",
    columns: [
      primaryKey(),
      makeColumn("customer_id", "number"),
      makeColumn("address_id", "number"),
      makeColumn("billing_address_id", "number"),
    ],
  },
  {
    id: 3,
    schema: "public",
    tableName: "order_lines",
    columns: [primaryKey(), makeColumn("order_id", "number"), makeColumn("product_id", "number")],
  },
  {
    id: 4,
    schema: "public",
    tableName: "addresses",
    columns: [primaryKey(), makeColumn("customer_id", "number")],
  },
  {
    id: 5,
    schema: "public",
    tableName: "products",
    columns: [primaryKey()],
  },
];

const NODE_RELATION_MAPPING: Record<string, string> = {
  Customers: "customers",
  Orders: "orders",
  OrderLines: "order_lines",
  Addresses: "addresses",
  Products: "products",
  DeliveryAddresses: "addresses",
  BillingAddresses: "addresses",
};

type JoinSpec = `${string}.${string} --- ${string}.${string}`;

function setupGraph(spec: JoinSpec[]) {
  const graph = Graph.newEmpty();
  const uniqueNodeNames: Set<string> = new Set();
  const nodeNames: Record<string, string> = {};
  const nodeIds: Record<string, GraphNodeID> = {};
  const edgeIds: GraphEdgeID[] = [];
  const relations: Record<string, Relation> = {};

  for (const join of spec) {
    const [left, right] = join.split(" --- ");
    const [leftNode] = left.split(".");
    const [rightNode] = right.split(".");
    uniqueNodeNames.add(leftNode);
    uniqueNodeNames.add(rightNode);
  }
  for (const nodeName of uniqueNodeNames) {
    const relationTableName = NODE_RELATION_MAPPING[nodeName];
    invariant(relationTableName, `Relation mapping for node ${nodeName} not found`);
    const relation = TEST_RELATIONS.find((r) => r.tableName === relationTableName);
    invariant(relation, `Relation for node ${nodeName} not found`);
    const nodeId = graph.addNode(nodeName, relation);
    nodeNames[nodeId] = nodeName;
    nodeIds[nodeName] = nodeId;
    relations[nodeName] = relation;
  }
  for (const join of spec) {
    const [left, right] = join.split(" --- ");
    const [leftNode, leftColumnName] = left.split(".");
    const [rightNode, rightColumnName] = right.split(".");
    const leftColumn = relations[leftNode].columns.find((c) => c.name === leftColumnName);
    const rightColumn = relations[rightNode].columns.find((c) => c.name === rightColumnName);
    invariant(leftColumn, `Left column ${leftColumnName} not found`);
    invariant(rightColumn, `Right column ${rightColumnName} not found`);
    const edgeId = graph.addEdge(
      { nodeId: nodeIds[leftNode], columnId: leftColumn.id },
      { nodeId: nodeIds[rightNode], columnId: rightColumn.id },
    );
    edgeIds.push(edgeId);
  }
  function describeJoin(joinItem: JoinItem) {
    const left = `${nodeNames[joinItem.left.nodeId]}.${columnNames[joinItem.left.columnId]}`;
    const right = `${nodeNames[joinItem.right.nodeId]}.${columnNames[joinItem.right.columnId]}`;
    return `${left} --- ${right}`;
  }
  return {
    graph,
    nodeIds,
    nodeNames,
    edgeIds,
    describeJoin,
    relations: Object.values(relations),
  };
}

function testIdGenerator() {
  let counter = 0;
  return () => `test-${counter++}`;
}

describe("Graph", () => {
  describe("joinPath", () => {
    describe("where only one join is required", () => {
      test("calculates a simple join path", () => {
        const { graph, nodeIds, nodeNames } = setupGraph(["Customers.id --- Orders.customer_id"]);
        const path = graph.joinPath(nodeIds.Customers, nodeIds.Orders);

        expect(path.length).toEqual(1);
        const join = path[0];
        expect(nodeNames[join.left.nodeId]).toEqual("Customers");
        expect(columnNames[join.left.columnId]).toEqual("id");
        expect(nodeNames[join.right.nodeId]).toEqual("Orders");
        expect(columnNames[join.right.columnId]).toEqual("customer_id");
      });

      test("calculates a simple join path in the opposite direction", () => {
        const { graph, nodeIds, describeJoin } = setupGraph([
          "Customers.id --- Orders.customer_id",
        ]);
        const path = graph.joinPath(nodeIds.Orders, nodeIds.Customers);

        expect(path.length).toEqual(1);
        const join = path[0];
        expect(describeJoin(join)).toEqual("Orders.customer_id --- Customers.id");
      });
    });

    describe("where two joins are required", () => {
      test("calculates the correct join path", () => {
        const { graph, nodeIds, describeJoin } = setupGraph([
          "Customers.id --- Orders.customer_id",
          "Orders.id --- OrderLines.order_id",
        ]);
        const path = graph.joinPath(nodeIds.Customers, nodeIds.OrderLines);

        expect(path.length).toEqual(2);
        const firstJoin = path[0];
        expect(describeJoin(firstJoin)).toEqual("Customers.id --- Orders.customer_id");
        const secondJoin = path[1];
        expect(describeJoin(secondJoin)).toEqual("Orders.id --- OrderLines.order_id");
      });
    });

    describe("multiJoinPath", () => {
      describe("when there is only one to entity", () => {
        test("returns the same result as #join_path", () => {
          const { graph, nodeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
            "Orders.address_id --- Addresses.id",
          ]);

          const expected = graph.joinPath(nodeIds.Customers, nodeIds.Orders);

          const result = graph.multiJoinPath(nodeIds.Customers, [nodeIds.Orders]);

          expect(result.map((join) => join.joinId)).toEqual(expected.map((join) => join.joinId));
        });
      });

      describe("when there are multiple entities all in the same direction", () => {
        test("returns the same result as joining to the outermost entity", () => {
          const { graph, nodeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
            "Orders.address_id --- Addresses.id",
          ]);

          const expected = graph.joinPath(nodeIds.Customers, nodeIds.OrderLines);

          const result = graph.multiJoinPath(nodeIds.Customers, [
            nodeIds.Orders,
            nodeIds.OrderLines,
          ]);

          expect(result.map((join) => join.joinId)).toEqual(expected.map((join) => join.joinId));
        });
      });

      describe("when there are multiple entities that join in different directions", () => {
        test("includes all the expected joins", () => {
          const { graph, nodeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
            "Orders.address_id --- Addresses.id",
          ]);

          const customersExpected = graph.joinPath(nodeIds.Orders, nodeIds.Customers);
          const productsExpected = graph.joinPath(nodeIds.Orders, nodeIds.Products);

          const result = graph.multiJoinPath(nodeIds.Orders, [nodeIds.Customers, nodeIds.Products]);

          for (const item of customersExpected) {
            expect(result.map((join) => join.joinId)).toContain(item.joinId);
          }
          for (const item of productsExpected) {
            expect(result.map((join) => join.joinId)).toContain(item.joinId);
          }
        });

        test("does not duplicate any joins", () => {
          const { graph, nodeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
            "Orders.address_id --- Addresses.id",
          ]);

          const result = graph.multiJoinPath(nodeIds.Customers, [nodeIds.Orders, nodeIds.Products]);

          expect(new Set(result.map((join) => join.joinId)).size).toEqual(result.length);
        });
      });

      describe("addEdge", () => {
        test("adds a join between two entities to the model", () => {
          const projectsRelation = {
            id: 1,
            schema: "public",
            tableName: "projects",
            columns: [makeColumn("id", "number")],
          };
          const tasksRelation = {
            id: 2,
            schema: "public",
            tableName: "tasks",
            columns: [makeColumn("id", "number"), makeColumn("project_id", "number")],
          };
          const graph = Graph.newEmpty();
          const projectsNodeId = graph.addNode("Projects", projectsRelation);
          const tasksNodeId = graph.addNode("Tasks", tasksRelation);
          graph.addEdge(
            {
              nodeId: projectsNodeId,
              columnId: projectsRelation.columns[0].id,
            },
            { nodeId: tasksNodeId, columnId: tasksRelation.columns[1].id },
          );

          expect(graph.joinPath(projectsNodeId, tasksNodeId).length).toEqual(1);
        });

        test("does not allow multiple paths to a single entity", () => {
          expect(() => {
            setupGraph([
              "Orders.address_id --- Addresses.id",
              "Orders.billing_address_id --- Addresses.id",
            ]);
          }).toThrow("join path already exists");
        });

        test("allows two entities to reference the same table", () => {
          expect(() => {
            setupGraph([
              "Orders.address_id --- Addresses.id",
              "Orders.billing_address_id --- BillingAddresses.id",
            ]);
          }).not.toThrow();
        });
      });

      describe("isolatedNodes", () => {
        test("returns nodes with no connections", () => {
          const { graph } = setupGraph(["Customers.id --- Orders.customer_id"]);
          graph.addNode("IsolatedTable", {
            id: 100,
            schema: "public",
            tableName: "isolated_table",
            columns: [primaryKey()],
          });

          const isolated = graph.isolatedNodes();

          expect(isolated.length).toBe(1);
          expect(isolated[0].name).toBe("IsolatedTable");
        });

        test("returns empty array when all nodes are connected", () => {
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
          ]);

          const isolated = graph.isolatedNodes();

          expect(isolated).toEqual([]);
        });

        test("returns all nodes when none are connected", () => {
          const graph = Graph.newEmpty();
          graph.addNode("Customers", {
            id: 1,
            schema: "public",
            tableName: "customers",
            columns: [primaryKey()],
          });
          graph.addNode("Products", {
            id: 2,
            schema: "public",
            tableName: "products",
            columns: [primaryKey()],
          });

          const isolated = graph.isolatedNodes();

          expect(isolated.length).toBe(2);
          expect(isolated.map((n) => n.name).sort()).toEqual(["Customers", "Products"]);
        });
      });

      describe("connectedNodes", () => {
        test("returns nodes with connections", () => {
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
          ]);
          graph.addNode("IsolatedTable", {
            id: 100,
            schema: "public",
            tableName: "isolated_table",
            columns: [primaryKey()],
          });

          const connected = graph.connectedNodes();

          expect(connected.length).toBe(3);
          expect(connected.map((n) => n.name).sort()).toEqual([
            "Customers",
            "OrderLines",
            "Orders",
          ]);
        });

        test("returns empty array when no nodes are connected", () => {
          const graph = Graph.newEmpty();

          const connected = graph.connectedNodes();

          expect(connected).toEqual([]);
        });
      });

      describe("removeNode", () => {
        test("keeps the graph in a serializable state", async () => {
          const nodeNames = ["Customers", "Orders", "OrderLines"];

          for (const name of nodeNames) {
            const { graph, nodeIds, relations } = setupGraph([
              "Customers.id --- Orders.customer_id",
              "Orders.id --- OrderLines.order_id",
            ]);
            graph.removeNode(nodeIds[name]); // Remove Orders node
            const serialized = graph.serialize();

            const newGraph = await Graph.fromSerialized(serialized, relations);

            expect(newGraph.serialize()).toEqual(serialized);
          }
        });

        test("removes node and all associated joins", () => {
          const { graph, nodeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
          ]);
          graph.removeNode(nodeIds.Orders); // Remove Orders node

          // Verify node is removed
          expect(graph.hasNode(nodeIds.Orders)).toBe(false);

          // Verify other nodes still exist
          expect(graph.hasNode(nodeIds.Customers)).toBe(true);
          expect(graph.hasNode(nodeIds.OrderLines)).toBe(true);

          // Verify joins are cleaned up
          expect(graph.joinPath(nodeIds.Customers, nodeIds.OrderLines)).toHaveLength(0);
        });

        test("throws error when removing non-existent node", () => {
          const graph = Graph.newEmpty();

          expect(() => graph.removeNode("DOESNOTEXIST" as GraphNodeID)).toThrow();
        });
      });

      describe("removeEdge", () => {
        test("removes edge and its reverse join", () => {
          const { graph, nodeIds, edgeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
          ]);
          // Remove Customers->Orders edge
          graph.removeEdge(edgeIds[0]);

          // Verify join is removed in both directions
          expect(graph.joinPath(nodeIds.Customers, nodeIds.Orders)).toHaveLength(0);
          expect(graph.joinPath(nodeIds.Orders, nodeIds.Customers)).toHaveLength(0);

          // Verify other joins still exist
          expect(graph.joinPath(nodeIds.OrderLines, nodeIds.Products)).toHaveLength(1);
        });

        test("throws error when removing non-existent edge", () => {
          const graph = Graph.newEmpty();

          expect(() => graph.removeEdge("abc" as GraphEdgeID)).toThrow(
            "Edge with ID abc not found in graph",
          );
        });

        test("maintains graph integrity after removing multiple edges", () => {
          const { graph, nodeIds, edgeIds } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
          ]);

          for (const edgeId of edgeIds) {
            graph.removeEdge(edgeId);
          }

          // Verify all joins are removed
          expect(graph.joinPath(nodeIds.Customers, nodeIds.Orders)).toHaveLength(0);
          expect(graph.joinPath(nodeIds.Orders, nodeIds.OrderLines)).toHaveLength(0);
          expect(graph.joinPath(nodeIds.OrderLines, nodeIds.Products)).toHaveLength(0);
          // Verify nodes still exist
          expect(graph.hasNode(nodeIds.Customers)).toBe(true);
          expect(graph.hasNode(nodeIds.Orders)).toBe(true);
          expect(graph.hasNode(nodeIds.OrderLines)).toBe(true);
          expect(graph.hasNode(nodeIds.Products)).toBe(true);
        });
      });

      describe("isValid", () => {
        test("returns true for empty graph", () => {
          const emptyGraph = Graph.newEmpty();
          expect(emptyGraph.isValid()).toBe(true);
        });

        test("returns true when all nodes are orphaned", () => {
          const graph = Graph.newEmpty();
          graph.addNode("Customers", {
            id: 1,
            schema: "public",
            tableName: "customers",
            columns: [primaryKey()],
          });

          expect(graph.isValid()).toBe(true);
        });

        test("returns true for single connected component", () => {
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
          ]);
          graph.addNode("IsolatedTable", {
            id: 1,
            schema: "public",
            tableName: "isolated_table",
            columns: [primaryKey()],
          });

          expect(graph.isValid()).toBe(true);
        });

        test("returns false for multiple disconnected components", () => {
          // Create two separate components:
          // Customers -> Orders
          // Products -> Categories
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Products.id --- OrderLines.product_id",
          ]);

          expect(graph.isValid()).toBe(false);
        });

        test("returns true for complex but single connected component", () => {
          // Create a more complex connected structure:
          // Customers -> Orders -> Products
          //          \-> Categories
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
          ]);

          expect(graph.isValid()).toBe(true);
        });
      });

      describe("validate", () => {
        test("returns valid status and no errors for empty graph", () => {
          const emptyGraph = Graph.newEmpty();
          const result = emptyGraph.validate();

          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });

        test("returns valid status and no errors when all nodes are orphaned", () => {
          const graph = Graph.newEmpty();
          graph.addNode("Customers", {
            id: 1,
            schema: "public",
            tableName: "customers",
            columns: [primaryKey()],
          });
          graph.addNode("Products", {
            id: 2,
            schema: "public",
            tableName: "products",
            columns: [primaryKey()],
          });

          const result = graph.validate();

          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });

        test("returns valid status and no errors for single connected component with isolated nodes", () => {
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
          ]);
          graph.addNode("IsolatedTable", {
            id: 1,
            schema: "public",
            tableName: "isolated_table",
            columns: [primaryKey()],
          });

          const result = graph.validate();

          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });

        test("returns invalid status and appropriate errors for multiple disconnected components", () => {
          // Create two separate components:
          // Customers -> Orders
          // Products -> OrderLines
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Products.id --- OrderLines.product_id",
          ]);

          const result = graph.validate();

          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toContain("separate sets of linked nodes");
        });

        test("returns valid status and no errors for complex but single connected component", () => {
          // Create a more complex connected structure
          const { graph } = setupGraph([
            "Customers.id --- Orders.customer_id",
            "Orders.id --- OrderLines.order_id",
            "OrderLines.product_id --- Products.id",
          ]);

          const result = graph.validate();

          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });
  });

  describe("serialization", () => {
    test("serializes and deserializes graph correctly", async () => {
      // Create a simple graph with two nodes and one edge
      const graph = Graph.newEmpty(testIdGenerator());
      const customersPK = primaryKey();
      const customersRelation = {
        id: 1,
        schema: "public",
        tableName: "customers",
        columns: [customersPK],
      };
      const customerIdColumn = makeColumn("customer_id", "number");
      const ordersPK = primaryKey();
      const ordersRelation = {
        id: 2,
        schema: "public",
        tableName: "orders",
        columns: [ordersPK, customerIdColumn],
      };

      // Add nodes and edge
      const customersNodeId = graph.addNode("Customers", customersRelation);
      const ordersNodeId = graph.addNode("Orders", ordersRelation);
      graph.addEdge(
        { nodeId: customersNodeId, columnId: customersPK.id },
        { nodeId: ordersNodeId, columnId: customerIdColumn.id },
      );

      // Serialize the graph
      const serialized = graph.serialize();

      // Deserialize back to a new graph instance
      const hydrated = await Graph.fromSerialized(
        serialized,
        [customersRelation, ordersRelation],
        testIdGenerator(),
      );

      // Serialize again and compare
      const reserializedData = hydrated.serialize();
      expect(reserializedData).toEqual(serialized);
    });

    test("serialized format matches snapshot", async () => {
      // Create a very simple graph with two connected nodes
      const graph = Graph.newEmpty(testIdGenerator());
      const customersPK = primaryKey();
      const customersRelation = {
        id: 1,
        schema: "public",
        tableName: "customers",
        columns: [customersPK],
      };
      const customerIdColumn = makeColumn("customer_id", "number");
      const ordersPK = primaryKey();
      const ordersRelation = {
        id: 2,
        schema: "public",
        tableName: "orders",
        columns: [ordersPK, customerIdColumn],
      };

      // Add nodes and edge
      const customersNodeId = graph.addNode("Customers", customersRelation);
      const ordersNodeId = graph.addNode("Orders", ordersRelation);
      graph.addEdge(
        { nodeId: customersNodeId, columnId: customersPK.id },
        { nodeId: ordersNodeId, columnId: customerIdColumn.id },
      );

      // Serialize and match against snapshot
      const serialized = graph.serialize();
      expect(serialized).toMatchSnapshot();
    });

    test("fromSerialized throws error for invalid input", async () => {
      const invalidInputs = [
        { nodes: "not an array" },
        { edges: "not an array" },
        { nodes: [], edges: "not an array" },
        { nodes: [], edges: [{ invalid: "edge" }] },
        { nodes: [{ invalid: "node" }], edges: [] },
        { nodes: [], edges: [], version: 2 }, // wrong version
        { nodes: [], edges: [] }, // missing version
      ];

      for (const invalidInput of invalidInputs) {
        expect(() => Graph.fromSerialized(invalidInput, [])).toThrow();
      }
    });
  });
});
