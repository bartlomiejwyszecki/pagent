import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ScopeManager, ScopeViolationError } from "../../src/core/scopeManager";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-agent-scope-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("ScopeManager", () => {
  it("resolves files within the allowed directory scope", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo",
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"]
    });

    const resolvedPath = scopeManager.resolveFilePath("src/index.ts");

    expect(resolvedPath).toContain("C:");
    expect(
      resolvedPath.endsWith("repo\\src\\index.ts") || resolvedPath.endsWith("repo/src/index.ts")
    ).toBe(true);
  });

  it("rejects files outside the allowed directory scope", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo",
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"]
    });

    expect(() => scopeManager.resolveFilePath("tests/index.ts")).toThrow(ScopeViolationError);
  });

  it("rejects files with disallowed extensions", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo",
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"]
    });

    expect(() => scopeManager.resolveFilePath("src/readme.md")).toThrow(ScopeViolationError);
  });

  it("treats hidden paths as invisible by default", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo"
    });

    expect(scopeManager.isPathVisible(".env")).toBe(false);
    expect(scopeManager.isPathVisible("src/.secrets/config.ts")).toBe(false);
    expect(scopeManager.isPathVisible("src/index.ts")).toBe(true);
  });

  it("truncates content to the configured read limit", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo",
      maxReadChars: 5
    });

    expect(scopeManager.truncateToReadLimit("abcdefgh")).toEqual({
      content: "abcde",
      truncated: true
    });
  });

  it("ignores files matched by explicit ignore patterns", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src", "generated"), { recursive: true });
    await writeFile(join(root, "src", "generated", "types.ts"), "export {};\n", "utf8");

    const scopeManager = new ScopeManager({
      workspaceRoot: root,
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"],
      ignorePatterns: ["src/generated/**"]
    });

    expect(scopeManager.isIgnored("src/generated/types.ts")).toBe(true);
    expect(() => scopeManager.resolveFilePath("src/generated/types.ts")).toThrow(ScopeViolationError);
  });

  it("respects .gitignore rules from the workspace root", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "node_modules\n", "utf8");
    await writeFile(join(root, "node_modules", "pkg", "index.ts"), "export {};\n", "utf8");

    const scopeManager = new ScopeManager({
      workspaceRoot: root,
      allowedDirectories: ["."],
      allowedExtensions: [".ts"]
    });

    expect(scopeManager.isIgnored("node_modules/pkg/index.ts")).toBe(true);
    expect(() => scopeManager.resolveFilePath("node_modules/pkg/index.ts")).toThrow(
      ScopeViolationError
    );
  });

  it("allows non-ignored files when .gitignore is enabled", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "node_modules\n", "utf8");
    await writeFile(join(root, "src", "index.ts"), "export {};\n", "utf8");

    const scopeManager = new ScopeManager({
      workspaceRoot: root,
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"]
    });

    expect(scopeManager.isIgnored("src/index.ts")).toBe(false);
    expect(scopeManager.resolveFilePath("src/index.ts")).toContain("src");
  });
});