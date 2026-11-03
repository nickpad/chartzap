import { startCompletion, acceptCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { CodeEditor } from "../../packages/codemirror/src/CodeEditor.js";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

describe("CodeEditor", () => {
  test("renders with initial formula", async () => {
    const onChange = vi.fn();
    const screen = await render(<CodeEditor initialFormula="SUM(1, 2)" onChange={onChange} />);

    // CodeMirror renders the formula in a .cm-content element
    await expect.element(screen.getByText("SUM")).toBeVisible();
  });

  test("calls onChange when user types", async () => {
    const onChange = vi.fn();
    const screen = await render(<CodeEditor initialFormula="" onChange={onChange} />);

    // CodeMirror creates a contenteditable element with role="textbox"
    const editor = screen.getByRole("textbox");
    await editor.click();
    await editor.fill("123");

    expect(onChange).toHaveBeenCalled();
    // The last call should contain the typed text
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe("123");
  });

  test("displays function names with syntax highlighting", async () => {
    const onChange = vi.fn();
    const screen = await render(<CodeEditor initialFormula="IF(TRUE, 1, 0)" onChange={onChange} />);

    // Function names get a specific class for syntax highlighting
    await expect.element(screen.getByText("IF")).toBeVisible();
    await expect.element(screen.getByText("TRUE")).toBeVisible();
  });
});

describe("standalone integration", () => {
  test("exposes semantic highlighting classes", async () => {
    const screen = await render(<CodeEditor initialFormula="IF(TRUE, 1, 0)" onChange={() => {}} />);
    expect(screen.getByText("IF").element()).toHaveClass("af-function");
    expect(screen.getByText("TRUE").element()).toHaveClass("af-boolean");
  });
  test("offers and accepts function completion", async () => {
    const screen = await render(
      <CodeEditor
        initialFormula="SU"
        onChange={() => {}}
        autocomplete={{ isFilter: false, lookup: new Map(), functionNames: ["Sum"] }}
      />,
    );
    const element = screen.getByRole("textbox").element();
    if (!(element instanceof HTMLElement)) throw new Error("Expected an HTML editor");
    const view = EditorView.findFromDOM(element)!;
    view.focus();
    view.dispatch({ selection: { anchor: 2 } });
    startCompletion(view);
    await expect.element(screen.getByRole("option", { name: "Sum" })).toBeVisible();
    await expect.poll(() => acceptCompletion(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Sum()");
  });
  test("destroys the editor when React unmounts it", async () => {
    const destroy = vi.spyOn(EditorView.prototype, "destroy");
    const screen = await render(<CodeEditor initialFormula="1" onChange={() => {}} />);
    await screen.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".cm-editor")).toBeNull();
    destroy.mockRestore();
  });
  test("uses updated change callbacks without losing the editor", async () => {
    const first = vi.fn(),
      second = vi.fn();
    const screen = await render(<CodeEditor initialFormula="1" onChange={first} />);
    await screen.rerender(<CodeEditor initialFormula="1" onChange={second} />);
    await screen.getByRole("textbox").fill("2");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenLastCalledWith("2");
  });
});
