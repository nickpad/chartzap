import { mkdtemp, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "chartzap-packages-"));
function run(command, args, cwd = temp) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const dependencies = {};
  for (const name of ["core", "postgres", "codemirror"]) {
    run("pnpm", ["pack", "--pack-destination", temp], join(root, "packages", name));
    dependencies[`@chartzap/${name}`] = `file:${join(temp, `chartzap-${name}-0.1.0.tgz`)}`;
  }
  dependencies.react = "^19.1.0";
  await writeFile(
    join(temp, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies,
      pnpm: { overrides: { "@chartzap/core": dependencies["@chartzap/core"] } },
      devDependencies: { typescript: "^5.8.3", "@types/react": "^19.1.2" },
    }),
  );
  run("pnpm", [
    "install",
    "--ignore-scripts",
    ...(process.env.PACKAGE_TEST_OFFLINE ? ["--offline"] : []),
  ]);
  await copyFile(join(root, "scripts/consumer.ts"), join(temp, "consumer.ts"));
  run("pnpm", [
    "exec",
    "tsc",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--jsx",
    "react-jsx",
    "consumer.ts",
  ]);
  const core = JSON.parse(await readFile(join(root, "packages/core/package.json"), "utf8"));
  const postgres = JSON.parse(await readFile(join(root, "packages/postgres/package.json"), "utf8"));
  const codemirror = JSON.parse(
    await readFile(join(root, "packages/codemirror/package.json"), "utf8"),
  );
  const all = [core, postgres, codemirror].flatMap((p) =>
    Object.keys(p.exports).map((key) => p.name + (key === "." ? "" : key.slice(1))),
  );
  await writeFile(
    join(temp, "exports.mjs"),
    `for (const spec of ${JSON.stringify(all)}) await import(spec);\nconsole.log("All ${all.length} package exports loaded without DOM globals");`,
  );
  process.stdout.write(run("node", ["exports.mjs"]));
  await writeFile(
    join(temp, "flow.mjs"),
    `import {createSchemaGraph,createFormulaEngine} from '@chartzap/core';
import {postgres} from '@chartzap/postgres';
const engine=createFormulaEngine({graph:createSchemaGraph({relations:[],graphNodes:[],graphEdges:[]})});
const result=engine.compileQuery({columns:[{name:'Value',formula:'IF(TRUE, 2 + 3, 4)'}],compiler:postgres()});
if(!result.ok || result.sql.parameters.length!==4 || !result.sql.text.includes('$2::numeric + $3::numeric')) throw Error('Fresh-consumer compilation failed');
console.log('Fresh-consumer compilation and declaration checks passed');`,
  );
  process.stdout.write(run("node", ["flow.mjs"]));
} finally {
  await rm(temp, { recursive: true, force: true });
}
