import { readdir } from "node:fs/promises";
import { join } from "node:path";

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

async function walkDirectory(
  currentPath: string,
  scopeManager: ScopeManager,
  recursive: boolean,
  depth: number
): Promise<ListFilesEntry[]> {
  scopeManager.assertRecursionDepth(depth);

  const dirEntries = await readdir(currentPath, { withFileTypes: true });
  const results: ListFilesEntry[] = [];

  for (const entry of dirEntries) {
    const absoluteEntryPath = join(currentPath, entry.name);
    const relativeEntryPath = scopeManager.toRelativePath(absoluteEntryPath);

    if (entry.isDirectory()) {
      if (!scopeManager.isPathAllowed(absoluteEntryPath, "directory")) {
        continue;
      }

      results.push({
        path: relativeEntryPath,
        type: "directory"
      });

      if (recursive) {
        const nestedEntries = await walkDirectory(
          absoluteEntryPath,
          scopeManager,
          recursive,
          depth + 1
        );
        results.push(...nestedEntries);
      }

      continue;
    }

    if (!scopeManager.isPathAllowed(absoluteEntryPath, "file")) {
      continue;
    }

    results.push({
      path: relativeEntryPath,
      type: "file"
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
  const entries = await walkDirectory(targetPath, scopeManager, Boolean(input.recursive), 0);

  entries.sort((left, right) => left.path.localeCompare(right.path));
  scopeManager.assertListResultLimit(entries.length);

  return {
    root: scopeManager.getPolicy().workspaceRoot,
    target: scopeManager.toRelativePath(targetPath),
    entries
  };
}