import type { QueryCompiler } from "@chartzap/core";
import { buildQueryPlan } from "./queryplan/index.js";
import type { FinalQuery } from "./queryplan/types.js";
import { renderPostgres } from "./sqlgen/render.js";
export * from "./queryplan/index.js";
export * from "./queryplan/types.js";
export * from "./sqlgen/index.js";
export function postgres(): QueryCompiler<FinalQuery> {
  return {
    compile(input) {
      const plan = buildQueryPlan(input);
      return { plan, sql: renderPostgres(plan, input.graph) };
    },
  };
}
