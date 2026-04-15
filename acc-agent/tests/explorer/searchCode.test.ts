import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { searchCode } from "../../src/tools/explorer/searchCode";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-agent-search-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("searchCode", () => {
  it("searches only scoped files and returns relative match locations", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const agent = 'Explorer';\n", "utf8");
    await writeFile(join(root, "src", "nested", "helper.ts"), "const value = agentFactory();\n", "utf8");

    const result = await searchCode({ query: "agent", path: "src" }, root);

    expect(result.target).toBe("src");
    expect(result.query).toBe("agent");
    expect(result.matches).toEqual([
      {
        path: "src/index.ts",
        lineNumber: 1,
        column: 14,
        line: "export const agent = 'Explorer';"
      },
      {
        path: "src/nested/helper.ts",
        lineNumber: 1,
        column: 15,
        line: "const value = agentFactory();"
      }
    ]);
  });

  it("respects .gitignore and skips ignored files", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "generated"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "generated\n", "utf8");
    await writeFile(join(root, "src", "index.ts"), "export const token = 'visible';\n", "utf8");
    await writeFile(join(root, "generated", "index.ts"), "export const token = 'hidden';\n", "utf8");

    const result = await searchCode({ query: "token" }, root);

    expect(result.matches).toEqual([
      {
        path: "src/index.ts",
        lineNumber: 1,
        column: 14,
        line: "export const token = 'visible';"
      }
    ]);
  });

  it("skips files with disallowed extensions", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "const needle = true;\n", "utf8");
    await writeFile(join(root, "src", "notes.txt"), "needle\n", "utf8");

    const result = await searchCode({ query: "needle", path: "src" }, root);

    expect(result.matches).toEqual([
      {
        path: "src/index.ts",
        lineNumber: 1,
        column: 7,
        line: "const needle = true;"
      }
    ]);
  });

  it("supports case-sensitive and case-insensitive search", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "const Explorer = 'agent';\n", "utf8");

    const insensitiveResult = await searchCode({ query: "explorer", path: "src" }, root);
    const sensitiveResult = await searchCode(
      { query: "explorer", path: "src", caseSensitive: true },
      root
    );

    expect(insensitiveResult.matches).toEqual([
      {
        path: "src/index.ts",
        lineNumber: 1,
        column: 7,
        line: "const Explorer = 'agent';"
      }
    ]);
    expect(sensitiveResult.matches).toEqual([]);
  });

  it("limits the number of returned matches", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "index.ts"),
      "match\nmatch\nmatch\n",
      "utf8"
    );

    const result = await searchCode({ query: "match", path: "src", maxResults: 2 }, root);

    expect(result.matches).toEqual([
      {
        path: "src/index.ts",
        lineNumber: 1,
        column: 1,
        line: "match"
      },
      {
        path: "src/index.ts",
        lineNumber: 2,
        column: 1,
        line: "match"
      }
    ]);
  });
});