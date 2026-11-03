import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { useEffect, useRef } from "react";

import { newAutocompleteExtension } from "./autocomplete.js";
import type { AutocompleteConfig } from "./autocomplete.js";
import { detectFuncFocus } from "./func-focus.js";
import type { FuncFocus } from "./func-focus.js";
import { formula, theme } from "./language.js";

export interface CodeEditorProps {
  initialFormula: string;
  onChange: (formula: string) => void;
  onFuncFocus?: (funcFocus?: FuncFocus) => void;
  linter?: Extension;
  autocomplete?: AutocompleteConfig;
  autoFocus?: boolean;
}

export function CodeEditor({
  initialFormula,
  onChange,
  onFuncFocus,
  linter,
  autocomplete,
  autoFocus,
}: CodeEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFuncFocusRef = useRef(onFuncFocus);
  onFuncFocusRef.current = onFuncFocus;

  useEffect(() => {
    if (ref.current === null) {
      return;
    }

    const syncChanges = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.view.state.doc.toString());
      }
    });

    const funcFocusListener = detectFuncFocus((f) => onFuncFocusRef.current?.(f));

    const extensions: Extension[] = [
      history(),
      bracketMatching(),
      closeBrackets(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      syncChanges,
      funcFocusListener,
      formula(),
      theme,
      EditorView.theme({
        "&.cm-focused": {
          outline: "none",
        },
      }),
    ];

    if (linter) {
      extensions.push(linter);
    }

    if (autocomplete) {
      extensions.push(autocompletion(), ...newAutocompleteExtension(autocomplete));
    }

    const startState = EditorState.create({
      doc: initialFormula,
      extensions,
    });

    const view = new EditorView({
      state: startState,
      parent: ref.current,
    });

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="af-editor" ref={ref} />;
}
