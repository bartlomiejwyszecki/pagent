import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listFiles } from "../../src/tools/explorer/listFiles";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-agent-list-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("listFiles", () => {
  it("lists top-level entries as relative scoped paths", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "# test\n", "utf8");

    const result = await listFiles({}, root);

    expect(result.target).toBe(".");
    expect(result.entries).toEqual([
      { path: "README.md", type: "file" },
      { path: "src", type: "directory" }
    ]);
  });

  it("lists nested entries recursively", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src", "tools"), { recursive: true });
    await writeFile(join(root, "src", "tools", "index.ts"), "export {};\n", "utf8");

    const result = await listFiles({ path: "src", recursive: true }, root);

    expect(result.target).toBe("src");
    expect(result.entries).toEqual([
      { path: "src/tools", type: "directory" },
      { path: "src/tools/index.ts", type: "file" }
    ]);
  });
});