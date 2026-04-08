import { describe, expect, it } from "vitest";

import { ScopeManager, ScopeViolationError } from "../../src/core/scopeManager";

describe("ScopeManager", () => {
  it("resolves files within the allowed directory scope", () => {
    const scopeManager = new ScopeManager({
      workspaceRoot: "C:/repo",
      allowedDirectories: ["src"],
      allowedExtensions: [".ts"]
    });

    const resolvedPath = scopeManager.resolveFilePath("src/index.ts");

    expect(resolvedPath).toContain("C:");
    expect(resolvedPath.endsWith("repo\\src\\index.ts") || resolvedPath.endsWith("repo/src/index.ts")).toBe(true);
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
});