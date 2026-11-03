const SQL_INDENT = "  ";

class StringBuffer {
  private segments: string[] = [];

  add(segment: string): void {
    this.segments.push(segment);
  }

  isAfterNewline(): boolean {
    const last = this.segments[this.segments.length - 1];
    return last === "\n";
  }

  toString(): string {
    return this.segments.join("");
  }

  trimEnd(): void {
    const last = this.segments[this.segments.length - 1];
    if (last !== undefined) {
      this.segments[this.segments.length - 1] = last.trimEnd();
    }
  }
}

class SQLText {
  private buffer: StringBuffer = new StringBuffer();
  private indentLevel = 0;

  constructor(indentLevel = 0) {
    this.indentLevel = indentLevel;
  }

  addLine(...elements: string[]): void {
    this.buffer.add(SQL_INDENT.repeat(this.indentLevel));
    elements.forEach((e, idx) => {
      this.buffer.add(e);
      if (idx < elements.length - 1) {
        this.buffer.add(" ");
      }
    });
    this.buffer.add("\n");
  }

  newLine(): void {
    this.buffer.add("\n");
  }

  indent(fn: () => void): void {
    this.indentLevel += 1;
    fn();
    if (!this.buffer.isAfterNewline()) {
      this.buffer.add("\n");
    }
    this.indentLevel -= 1;
  }

  addList(...elements: string[]): void {
    elements.forEach((e, idx) => {
      this.buffer.add(SQL_INDENT.repeat(this.indentLevel));
      this.buffer.add(e);
      if (idx < elements.length - 1) {
        this.buffer.add(",\n");
      }
    });
    this.buffer.add("\n");
  }

  listOf(items: undefined): void;
  listOf<T>(items: T[], fn: (item: T) => void): void;
  listOf<T>(items: T[] | undefined, fn?: (item: T) => void): void {
    if (items === undefined || items.length === 0) {
      return;
    }

    items.forEach((item, idx) => {
      fn!(item);
      this.buffer.trimEnd();
      if (idx < items.length - 1) {
        this.buffer.add(",");
      }
      this.buffer.add("\n");
    });
  }

  toString(): string {
    return this.buffer.toString();
  }
}

export { SQLText };
