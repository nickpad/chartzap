import { SQLText } from "../../packages/postgres/src/sqlgen/sql-text.js";
import { describe, expect, test } from "vitest";

describe("SQLText", () => {
  describe("addList", () => {
    test("adds a single element", () => {
      const sql = new SQLText();
      sql.addList("SELECT *");
      expect(sql.toString()).toBe("SELECT *\n");
    });

    test("adds multiple elements, comma separated on separate lines", () => {
      const sql = new SQLText();
      sql.addList("id", "name", "created_at");
      expect(sql.toString()).toBe("id,\nname,\ncreated_at\n");
    });

    test("respects indentation level", () => {
      const sql = new SQLText(1);
      sql.addList("id", "name", "created_at");
      expect(sql.toString()).toBe("  id,\n  name,\n  created_at\n");
    });

    test("handles empty list", () => {
      const sql = new SQLText();
      sql.addList();
      expect(sql.toString()).toBe("\n");
    });
  });

  describe("addLine", () => {
    test("adds a single line with indentation", () => {
      const sql = new SQLText();
      sql.addLine("SELECT");
      expect(sql.toString()).toBe("SELECT\n");
    });

    test("adds multiple elements space-separated", () => {
      const sql = new SQLText();
      sql.addLine("ORDER", "BY", "id");
      expect(sql.toString()).toBe("ORDER BY id\n");
    });

    test("respects indentation level", () => {
      const sql = new SQLText(2);
      sql.addLine("column_name");
      expect(sql.toString()).toBe("    column_name\n");
    });
  });

  describe("indent", () => {
    test("increases indent level for block", () => {
      const sql = new SQLText();
      sql.addLine("SELECT");
      sql.indent(() => {
        sql.addLine("id,");
        sql.addLine("name");
      });
      sql.addLine("FROM users");
      expect(sql.toString()).toBe("SELECT\n  id,\n  name\nFROM users\n");
    });

    test("can nest multiple levels", () => {
      const sql = new SQLText();
      sql.addLine("WITH");
      sql.indent(() => {
        sql.addLine("cte AS (");
        sql.indent(() => {
          sql.addLine("SELECT 1");
        });
        sql.addLine(")");
      });
      expect(sql.toString()).toBe("WITH\n  cte AS (\n    SELECT 1\n  )\n");
    });
  });

  describe("listOf", () => {
    test("iterates items with comma separation", () => {
      const sql = new SQLText();
      sql.listOf(["a", "b", "c"], (item) => {
        sql.addLine(item);
      });
      expect(sql.toString()).toBe("a,\nb,\nc\n");
    });

    test("handles undefined items", () => {
      const sql = new SQLText();
      sql.listOf(undefined);
      expect(sql.toString()).toBe("");
    });

    test("handles empty array", () => {
      const sql = new SQLText();
      sql.listOf([], (item) => {
        sql.addLine(item);
      });
      expect(sql.toString()).toBe("");
    });
  });

  describe("newLine", () => {
    test("adds a blank line", () => {
      const sql = new SQLText();
      sql.addLine("SELECT *");
      sql.newLine();
      sql.addLine("FROM users");
      expect(sql.toString()).toBe("SELECT *\n\nFROM users\n");
    });
  });
});
