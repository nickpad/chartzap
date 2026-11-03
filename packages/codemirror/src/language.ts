import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  syntaxHighlighting,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";

import { parser } from "@chartzap/core/formula/generated/formula";

const formulaHighlightStyle = HighlightStyle.define([
  { tag: t.function(t.propertyName), class: "af-function" },
  { tag: t.number, class: "af-number" },
  { tag: t.string, class: "af-string" },
  { tag: t.paren, class: "af-paren" },
  { tag: t.separator, class: "af-punctuation" },
  { tag: t.arithmeticOperator, class: "af-operator" },
  { tag: t.compareOperator, class: "af-compare" },
  { tag: t.logicOperator, class: "af-logic" },
  { tag: t.bool, class: "af-boolean" },
  { tag: t.variableName, class: "af-column" },
  { tag: t.lineComment, class: "af-punctuation" },
]);

const parserWithMetadata = parser.configure({
  props: [
    styleTags({
      "FunctionCall/Identifier": t.function(t.propertyName),
      Number: t.number,
      Text: t.string,
      "( )": t.paren,
      Comma: t.separator,
      "Multiply Divide Add Subtract": t.arithmeticOperator,
      "LessThan LessThanEqual GreaterThan GreaterThanEqual Equal NotEqual": t.compareOperator,
      "And Or": t.logicOperator,
      "True False": t.bool,
      "Column/ObjectName ResultSetColumn/ResultSetColumnName": t.variableName,
      LineComment: t.lineComment,
    }),
    indentNodeProp.add({
      ArgumentList: (context) => {
        return context.column(context.node.from) + context.unit;
      },
    }),
  ],
});

const formulaLanguage = LRLanguage.define({
  parser: parserWithMetadata,
});

function formula() {
  return new LanguageSupport(formulaLanguage, []);
}

const theme = syntaxHighlighting(formulaHighlightStyle);

export { formula, formulaLanguage, formulaHighlightStyle, theme };
