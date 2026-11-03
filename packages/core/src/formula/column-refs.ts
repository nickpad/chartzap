const COLUMN_ID_PREFIX = "#";
const COLUMN_REF_REGEX = /\{([^}]+)\}/g;

interface Column {
  id: string;
  displayName: string;
}

interface TransformResult {
  formula: string;
  errors: string[];
}

function formatIdRef(id: string): string {
  return `{${COLUMN_ID_PREFIX}${id}}`;
}

function formatNameRef(name: string): string {
  return `{${name}}`;
}

function isIdRef(ref: string): boolean {
  return ref.startsWith(COLUMN_ID_PREFIX);
}

function extractId(ref: string): string {
  return ref.slice(COLUMN_ID_PREFIX.length);
}

function resolveColumnIds(formula: string, columns: Column[]): TransformResult {
  const idToName = new Map(columns.map((c) => [c.id, c.displayName]));
  const errors: string[] = [];

  const resolved = formula.replace(COLUMN_REF_REGEX, (match, ref: string) => {
    if (!isIdRef(ref)) {
      return match;
    }
    const id = extractId(ref);
    const name = idToName.get(id);
    if (name === undefined) {
      errors.push(`Column with ID "${id}" not found`);
      return match;
    }
    return formatNameRef(name);
  });

  return { formula: resolved, errors };
}

function substituteColumnNames(formula: string, columns: Column[]): TransformResult {
  const nameToId = new Map(columns.map((c) => [c.displayName, c.id]));
  const errors: string[] = [];

  const substituted = formula.replace(COLUMN_REF_REGEX, (match, ref: string) => {
    if (isIdRef(ref)) {
      return match;
    }
    const id = nameToId.get(ref);
    if (id === undefined) {
      errors.push(`Column "${ref}" not found`);
      return match;
    }
    return formatIdRef(id);
  });

  return { formula: substituted, errors };
}

export { resolveColumnIds, substituteColumnNames };
