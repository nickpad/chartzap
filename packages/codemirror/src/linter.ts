import { linter } from "@codemirror/lint";
export interface FormulaDiagnostic {
  from: number;
  to: number;
  message: string;
}
export function formulaLinter(
  check: (formula: string) => readonly FormulaDiagnostic[] | Promise<readonly FormulaDiagnostic[]>,
  delay = 200,
) {
  return linter(
    async (view) => {
      const doc = view.state.doc;
      const errors = await check(doc.toString());
      if (view.state.doc !== doc) return [];
      return errors.map((error) => ({ ...error, severity: "error" as const }));
    },
    { delay },
  );
}
