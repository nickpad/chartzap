import { functionLookup } from "@chartzap/core/functions";
export function functionHelp(name: string, activeArgument?: number) {
  const func = functionLookup(name);
  if (!func) return undefined;
  return {
    name: func.name,
    description: func.description,
    aggregate: func.isAggregate,
    arguments: func.args.map((arg, index) => ({
      name: arg.name,
      description: arg.description,
      active: index === activeArgument,
    })),
  };
}
