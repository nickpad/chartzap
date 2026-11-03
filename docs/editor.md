# CodeMirror and React

`@chartzap/codemirror` has no React import. Supply the schema lookup and function
names explicitly, and supply a lint callback instead of an application endpoint.

```ts
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { functions, formulaDiagnostics } from "@chartzap/core";
import { formula, theme, formulaLinter, newAutocompleteExtension } from "@chartzap/codemirror";

const extensions = [
  formula(),
  theme,
  autocompletion(),
  ...newAutocompleteExtension({
    isFilter: false,
    lookup: new Map([["Orders", ["id", "total"]]]),
    functionNames: functions.map((f) => f.name),
  }),
  formulaLinter((text) => formulaDiagnostics(engine.checkColumn(text), text)),
];
const view = new EditorView({
  parent: document.querySelector("#editor")!,
  state: EditorState.create({ doc: "SUM([Orders/total])", extensions }),
});
// Dispose when the host component unmounts:
view.destroy();
```

`formulaLinter(check, delay?)` accepts synchronous or asynchronous diagnostics.
Stale results are discarded if the document changes before a response arrives.
It performs no network request by itself. Propagate or handle errors from a
remote checker in the callback according to your own UI policy.

For filters, use `isFilter: true`, `resultSetColumns`, and `functionNames`.
`getFuncFocus()` and `detectFuncFocus()` return `{ name, argN? }` for the innermost
function at the cursor. `functionHelp(name, activeArgument?)` returns plain render
data. There is no dependency on a component library or CSS framework.

## Highlighting

`formulaLanguage` exposes standard Lezer semantic tags. `theme` maps those tags
to `af-function`, `af-number`, `af-string`, `af-paren`, `af-punctuation`,
`af-operator`, `af-compare`, `af-logic`, `af-boolean`, and `af-column` classes.
No colors are shipped. Use your own `HighlightStyle` instead of `theme`, or style
the classes as the playground does. The wrapper container uses `af-editor`.

## React 19

```tsx
import { CodeEditor } from "@chartzap/codemirror/react";
<CodeEditor
  initialFormula="SUM([Orders/total])"
  onChange={setFormula}
  autocomplete={autocomplete}
  linter={lintExtension}
/>;
```

The wrapper is uncontrolled. `initialFormula`, autocomplete, lint extensions,
and autofocus configure the mounted editor. To reset the document/configuration,
change its React `key`. `onChange` and `onFuncFocus` callbacks may change without
remounting. The wrapper destroys its CodeMirror view during unmount; browser
tests exercise rendering, semantic highlighting, completion acceptance, updated
callbacks, and cleanup.
