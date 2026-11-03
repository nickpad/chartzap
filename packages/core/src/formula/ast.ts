const binaryOperators = {
  Multiply: "*",
  Divide: "/",
  Add: "+",
  Subtract: "-",
  LessThan: "<",
  LessThanEqual: "<=",
  GreaterThan: ">",
  GreaterThanEqual: ">=",
  Equal: "=",
  NotEqual: "!=",
  And: "AND",
  Or: "OR",
} as const;

type BinaryExpressionType = keyof typeof binaryOperators;

// The text span of a node in the formula expression. This can be used to
// highlight the relevant node in the formula editor, if there are type errors
// or other problems.
interface Meta {
  from: number;
  to: number;
}

// Properties shared by all node types
interface ASTNode {
  id: number;
  meta: Meta;
  // If this node is a function call argument, provides the function name and
  // argument position.
  arg?: {
    funcName: string;
    number: number;
  };
}

interface Scalar extends ASTNode {
  nodeType: "scalar";
  value: string | number | boolean;
}

interface FunctionCall<T> extends ASTNode {
  nodeType: "functionCall";
  name: string;
  args: T[];
}

interface Column extends ASTNode {
  nodeType: "column";
  graphNode: string;
  columnName: string;
}

interface AggColumn extends ASTNode {
  nodeType: "aggColumn";
  graphNode: string;
  columnName: string;
  relationName: string;
}

interface ResultSetColumn extends ASTNode {
  nodeType: "resultSetColumn";
  columnName: string;
}

type LeafNode = Scalar | Column | AggColumn | ResultSetColumn;

interface BinaryExpression<T> extends ASTNode {
  nodeType: "binaryExpression";
  expressionType: BinaryExpressionType;
  left: T;
  right: T;
}

// Abstract syntax tree for a formula expression
type AST = LeafNode | FunctionCall<AST> | BinaryExpression<AST>;

export { binaryOperators };

export type { AST, FunctionCall, Column };
