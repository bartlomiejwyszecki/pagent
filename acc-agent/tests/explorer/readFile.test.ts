import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readFile } from "../../src/tools/explorer/readFile";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-agent-read-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("readFile", () => {
  it("reads a full text file from the scoped root", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "example.ts"), "line1\nline2\nline3\n", "utf8");

    const result = await readFile({ path: "src/example.ts" }, root);

    expect(result).toEqual({
      path: "src/example.ts",
      content: "line1\nline2\nline3\n",
      startLine: 1,
      endLine: 4,
      totalLines: 4
    });
  });

  it("reads a selected line range from an allowed markdown file", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "notes.md"), "alpha\nbeta\ngamma\ndelta", "utf8");

    const result = await readFile({ path: "notes.md", startLine: 2, endLine: 3 }, root);

    expect(result).toEqual({
      path: "notes.md",
      content: "beta\ngamma",
      startLine: 2,
      endLine: 3,
      totalLines: 4
    });
  });

  it("rejects files with disallowed extensions before reading", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "data.bin"), Buffer.from([0, 1, 2, 3]));

    await expect(readFile({ path: "data.bin" }, root)).rejects.toThrow(
      'File "data.bin" does not match the allowed extension policy.'
    );
  });

  it("rejects files ignored by .gitignore", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "node_modules\n", "utf8");
    await writeFile(join(root, "node_modules", "pkg", "index.ts"), "export {};\n", "utf8");

    await expect(readFile({ path: "node_modules/pkg/index.ts" }, root)).rejects.toThrow(
      'Path "node_modules/pkg/index.ts" is ignored by scope rules.'
    );
  });

  it("truncates large file content to the scope read limit", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "example.md"), "a".repeat(12_000), "utf8");

    const result = await readFile({ path: "example.md" }, root);

    expect(result.content).toHaveLength(10_000);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.totalLines).toBe(1);
  });
});