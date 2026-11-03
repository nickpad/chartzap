import {
  createFormulaEngine,
  createSchemaGraph,
  type AST,
  type FormulaCheckResult,
} from "@chartzap/core";
import { postgres, type FinalQuery } from "@chartzap/postgres";
import { formula, formulaLinter, newAutocompleteExtension } from "@chartzap/codemirror";
import { CodeEditor, type CodeEditorProps } from "@chartzap/codemirror/react";
const graph = createSchemaGraph({ relations: [], graphNodes: [], graphEdges: [] });
const engine = createFormulaEngine({ graph });
const result = engine.compileQuery({
  columns: [{ name: "Value", formula: "1" }],
  compiler: postgres(),
});
if (result.ok) {
  const plan: FinalQuery = result.plan;
  const ast: AST = result.columns[0].expression;
  console.log(plan, ast);
}
const check: FormulaCheckResult = engine.checkColumn("1");
const props: CodeEditorProps = { initialFormula: "1", onChange: () => {} };
console.log(
  formula(),
  formulaLinter(() => []),
  newAutocompleteExtension({ isFilter: false, lookup: new Map(), functionNames: [] }),
  CodeEditor,
  props,
  check,
);
