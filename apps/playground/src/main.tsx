import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createFormulaEngine,
  createSchemaGraph,
  functions,
  formulaDiagnostics,
} from "@chartzap/core";
import { postgres } from "@chartzap/postgres";
import { CodeEditor } from "@chartzap/codemirror/react";
import { formulaLinter, functionHelp } from "@chartzap/codemirror";
import type { FuncFocus } from "@chartzap/codemirror";
import { atelier, exampleColumns } from "../../../examples/atelier/schema.js";
import "./style.css";
const graph = createSchemaGraph(atelier);
const engine = createFormulaEngine({ graph });
const lookup = new Map(
  graph
    .allNodes()
    .map((node) => [node.name, graph.getNode(node.id).relation.columns.map((c) => c.name)]),
);
const autocomplete = {
  isFilter: false as const,
  lookup,
  functionNames: functions.map((f) => f.name),
};
const lint = formulaLinter((formula) => formulaDiagnostics(engine.checkColumn(formula), formula));
const presets = [
  {
    name: "Revenue by studio",
    description: "Two measures, two grains, one result.",
    columns: exampleColumns,
  },
  {
    name: "Fulfilled orders",
    description: "An aggregate with a row-level condition.",
    columns: [
      { name: "Studio", formula: "[Studios/name]" },
      { name: "Fulfilled revenue", formula: "SUMIF([Orders/total], [Orders/fulfilled])" },
    ],
  },
  {
    name: "A formula with an error",
    description: "Diagnostics retain the source range.",
    columns: [{ name: "Eligible", formula: "[Orders/total] AND TRUE" }],
  },
  {
    name: "Just an expression",
    description: "No tables needed for scalar formulas.",
    columns: [{ name: "Greeting", formula: 'CONCAT("Hello", " from Chartzap")' }],
  },
];
function App() {
  const [preset, setPreset] = useState(0);
  const [columns, setColumns] = useState(exampleColumns);
  const [selected, setSelected] = useState(1);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"sql" | "plan" | "ast">("sql");
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState("");
  const [focus, setFocus] = useState<FuncFocus>();
  const [copied, setCopied] = useState(false);
  const result = useMemo(
    () =>
      engine.compileQuery({
        columns,
        filter,
        limit: limit === "" ? undefined : Number(limit),
        compiler: postgres(),
      }),
    [columns, filter, limit],
  );
  const active = columns[selected];
  const help = focus ? functionHelp(focus.name, focus.argN) : undefined;
  function updateFormula(formula: string) {
    setColumns((previous) => previous.map((c, i) => (i === selected ? { ...c, formula } : c)));
    setCopied(false);
  }
  function choosePreset(index: number) {
    setPreset(index);
    setColumns(presets[index].columns);
    setSelected(Math.min(1, presets[index].columns.length - 1));
    setFilter("");
    setRevision((r) => r + 1);
  }
  const output = result.ok
    ? tab === "sql"
      ? result.sql.text
      : JSON.stringify(
          tab === "plan"
            ? result.plan
            : result.columns.map((c) => ({ name: c.name, ast: c.expression })),
          null,
          2,
        )
    : "// Resolve the diagnostics to generate a query.";
  return (
    <>
      <header>
        <a
          className="wordmark"
          href="https://github.com/nickpad/chartzap"
          aria-label="Chartzap on GitHub"
        >
          <span className="mark">⌁</span> chartzap<span className="lab">FORMULA LAB</span>
        </a>
        <a className="source-link" href="https://github.com/nickpad/chartzap">
          View source <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">A TYPED LANGUAGE FOR ANALYTICS</div>
            <h1>
              Write the formula.
              <br />
              <em>Inspect the query.</em>
            </h1>
          </div>
          <p>
            From relational schema to PostgreSQL.
            <br />
            Follow every step: syntax, types, joins, and plan.
            <br />
            <span>Runs locally in your browser.</span>
          </p>
        </section>
        <div className="toolbar">
          <label className="example-picker">
            EXAMPLE{" "}
            <select
              aria-label="Example"
              value={preset}
              onChange={(e) => choosePreset(Number(e.target.value))}
            >
              {presets.map((p, i) => (
                <option value={i} key={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <span className="description">{presets[preset].description}</span>
          <span className="local-dot">NO DATABASE CONNECTION</span>
        </div>
        <div className="workbench">
          <aside className="schema">
            <div className="panel-title">
              <span>01 / SEMANTIC SCHEMA</span>
              <span className="tag">ATELIER</span>
            </div>
            <p className="schema-caption">
              A small studio commerce model.
              <br />
              Click a field to use it in the formula.
            </p>
            {atelier.graphNodes.map((node) => {
              const relation = atelier.relations.find(
                (r) => `${r.schema}.${r.name}` === node.relation,
              )!;
              return (
                <details open key={node.name}>
                  <summary>
                    {node.name}
                    <span>{relation.columns.length}</span>
                  </summary>
                  <div className="fields">
                    {relation.columns.map((field) => (
                      <button
                        key={field.name}
                        title={`Use [${node.name}/${field.name}]`}
                        onClick={() => {
                          updateFormula(`[${node.name}/${field.name}]`);
                          setRevision((r) => r + 1);
                        }}
                      >
                        <span className="field-type">
                          {field.type === "number"
                            ? "#"
                            : field.type === "text"
                              ? "Aa"
                              : field.type === "boolean"
                                ? "⊨"
                                : "◷"}
                        </span>
                        <span>{field.name}</span>
                        {relation.primaryKeys.includes(field.name) && (
                          <span className="pk">PK</span>
                        )}
                      </button>
                    ))}
                  </div>
                </details>
              );
            })}
            <div className="join-model">
              <span>UNIQUE JOIN PATHS</span>
              <code>Studios → Orders → Lines</code>
              <p>
                Each measure keeps its own grain.
                <br />
                Parent totals survive one-to-many joins.
              </p>
            </div>
          </aside>
          <section className="workspace">
            <div className="panel-title">
              <span>02 / DEFINE YOUR OUTPUT</span>
              <span className="tag">{functions.length} FUNCTIONS</span>
            </div>
            <div className="columns">
              {columns.map((column, i) => (
                <button
                  className={selected === i ? "selected" : ""}
                  key={i}
                  onClick={() => {
                    setSelected(i);
                    setFocus(undefined);
                  }}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{column.name}</strong>
                  <code>{column.formula}</code>
                  <span className="edit-hint">{selected === i ? "EDITING" : "↗"}</span>
                </button>
              ))}
            </div>
            <div className="editor-area">
              <div className="editor-heading">
                <label>FORMULA / {active.name}</label>
                <span>Ctrl+Space to complete</span>
              </div>
              <CodeEditor
                key={`${revision}:${selected}`}
                initialFormula={active.formula}
                onChange={updateFormula}
                onFuncFocus={setFocus}
                autocomplete={autocomplete}
                linter={lint}
              />
              {help ? (
                <div className="function-help">
                  <strong>{help.name}</strong>
                  <span>{help.description}</span>
                  <code>
                    {help.arguments.map((a, i) => (
                      <span className={a.active ? "active-arg" : ""} key={a.name}>
                        {i > 0 ? ", " : ""}
                        {a.name}
                      </span>
                    ))}
                  </code>
                </div>
              ) : (
                <p className="editor-caption">
                  Use [Table/field] for source columns and {"{Name}"} for result filters.
                </p>
              )}
            </div>
            <div className="query-options">
              <label>
                RESULT FILTER{" "}
                <input
                  aria-label="Result filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="{Revenue} > 50"
                  spellCheck={false}
                />
              </label>
              <label>
                ROW LIMIT{" "}
                <input
                  aria-label="Row limit"
                  type="number"
                  min="0"
                  step="1"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </label>
            </div>
            <div
              className={"diagnostics " + (result.ok ? "valid" : "invalid")}
              role="status"
              aria-live="polite"
            >
              {result.ok ? (
                <>
                  <span className="status-icon">✓</span>
                  <strong>Types check out</strong>
                  <span>
                    {result.columns.filter((c) => !c.isMeasure).length} dimensions ·{" "}
                    {result.columns.filter((c) => c.isMeasure).length} measures ·{" "}
                    {result.plan.ctes.length} CTEs
                  </span>
                </>
              ) : (
                <>
                  <span className="status-icon">!</span>
                  <div>
                    {result.diagnostics.map((d, i) => (
                      <p key={i}>
                        <strong>{d.column ?? "Query"}</strong> {d.message}
                        <small>
                          {" "}
                          [{d.from}:{d.to}]
                        </small>
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="output">
            <div className="panel-title">
              <span>03 / INSPECT THE COMPILATION</span>
              <span className="pg">POSTGRESQL</span>
            </div>
            <div className="output-toolbar">
              <div role="tablist" aria-label="Compiler output">
                {(["sql", "plan", "ast"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => {
                      setTab(t);
                      setCopied(false);
                    }}
                  >
                    {t === "sql" ? "SQL" : t === "plan" ? "Query plan" : "AST"}
                  </button>
                ))}
              </div>
              <button
                className="copy"
                disabled={!result.ok}
                onClick={async () => {
                  await navigator.clipboard.writeText(output);
                  setCopied(true);
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <pre
              className="code-output"
              role="tabpanel"
              aria-label={tab === "sql" ? "SQL output" : tab === "plan" ? "Query plan" : "AST"}
            >
              <code>{output}</code>
            </pre>
            <div className="parameters">
              <span>BOUND PARAMETERS</span>
              <code>{result.ok ? JSON.stringify(result.sql.parameters) : "—"}</code>
            </div>
          </section>
        </div>
        <footer>
          <span>Parser → Typechecker → Join planner → PostgreSQL</span>
          <span>
            TypeScript · Lezer · CodeMirror <span className="footer-sep">/</span> MIT licensed
          </span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
