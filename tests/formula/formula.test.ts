import { fileTests } from "@lezer/generator/dist/test";

import fs from "fs";
import path from "path";
import { parser } from "@chartzap/core/formula/generated/formula";
import { describe, test } from "vitest";

const fileTestsDir = path.join(__dirname, "file-tests");

for (const file of fs.readdirSync(fileTestsDir)) {
  if (file.endsWith(".txt")) {
    describe(file, () => {
      for (const { name, run } of fileTests(
        fs.readFileSync(path.join(fileTestsDir, file), "utf8"),
        file,
      )) {
        test(name, () => {
          run(parser);
        });
      }
    });
  }
}
