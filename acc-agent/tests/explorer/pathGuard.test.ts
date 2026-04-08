import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PathScopeError,
  assertPathWithinRoot,
  resolveScopedPath,
  toRelativeScopedPath
} from "../../src/tools/explorer/pathGuard";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-agent-path-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("pathGuard", () => {
  it("resolves in-scope relative paths", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"));

    const resolvedPath = resolveScopedPath("src", { root });

    expect(resolvedPath).toBe(resolve(root, "src"));
  });

  it("rejects paths outside the workspace root", async () => {
    const root = await createTempRoot();

    expect(() => resolveScopedPath("../outside", { root })).toThrow(PathScopeError);
  });

  it("converts absolute paths to scoped relative paths", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "nested"));

    const relativePath = toRelativeScopedPath(join(root, "nested"), { root });

    expect(relativePath).toBe("nested");
  });

  it("throws when asserting a path outside the root", async () => {
    const root = await createTempRoot();

    expect(() => assertPathWithinRoot(resolve(root, ".."), root)).toThrow(PathScopeError);
  });
});