import { stat } from "node:fs/promises";
import { join } from "node:path";

import fg from "fast-glob";

import { ScopeManager } from "../../core/scopeManager";

export interface ListFilesInput {
  path?: string;
  recursive?: boolean;
}

export interface ListFilesEntry {
  path: string;
  type: "file" | "directory";
}

export interface ListFilesResult {
  root: string;
  target: string;
  entries: ListFilesEntry[];
}

function createGlobPattern(targetRelativePath: string, recursive: boolean): string {
  if (targetRelativePath === ".") {
    return recursive ? "**/*" : "*";
  }

  return recursive ? `${targetRelativePath}/**/*` : `${targetRelativePath}/*`;
}

async function collectEntries(
  scopeManager: ScopeManager,
  targetPath: string,
  recursive: boolean
): Promise<ListFilesEntry[]> {
  const policy = scopeManager.getPolicy();
  const targetRelativePath = scopeManager.toRelativePath(targetPath);
  const pattern = createGlobPattern(targetRelativePath, recursive);

  const matchedPaths = await fg(pattern, {
    cwd: policy.workspaceRoot,
    onlyFiles: false,
    dot: policy.allowHiddenPaths,
    unique: true,
    followSymbolicLinks: false
  });

  const results: ListFilesEntry[] = [];

  for (const matchedPath of matchedPaths) {
    const absoluteEntryPath = join(policy.workspaceRoot, matchedPath);
    const entryStats = await stat(absoluteEntryPath);
    const entryType: ListFilesEntry["type"] = entryStats.isDirectory() ? "directory" : "file";

    if (!scopeManager.isPathAllowed(absoluteEntryPath, entryType)) {
      continue;
    }

    results.push({
      path: scopeManager.toRelativePath(absoluteEntryPath),
      type: entryType
    });
  }

  return results;
}

export async function listFiles(
  input: ListFilesInput,
  root: string
): Promise<ListFilesResult> {
  const scopeManager = new ScopeManager({
    workspaceRoot: root
  });

  const targetPath = scopeManager.resolveDirectoryPath(input.path);
  const entries = await collectEntries(scopeManager, targetPath, Boolean(input.recursive));

  entries.sort((left, right) => left.path.localeCompare(right.path));
  scopeManager.assertListResultLimit(entries.length);

  return {
    root: scopeManager.getPolicy().workspaceRoot,
    target: scopeManager.toRelativePath(targetPath),
    entries
  };
}