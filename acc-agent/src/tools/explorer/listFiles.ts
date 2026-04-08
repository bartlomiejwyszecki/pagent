import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { PathGuardOptions, resolveScopedPath, toRelativeScopedPath } from "./pathGuard";

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
  options: PathGuardOptions,
  recursive: boolean
): Promise<ListFilesEntry[]> {
  const dirEntries = await readdir(currentPath, { withFileTypes: true });
  const results: ListFilesEntry[] = [];

  for (const entry of dirEntries) {
    const absoluteEntryPath = join(currentPath, entry.name);
    const relativeEntryPath = toRelativeScopedPath(absoluteEntryPath, options);
    const entryType: ListFilesEntry["type"] = entry.isDirectory() ? "directory" : "file";

    results.push({
      path: relativeEntryPath,
      type: entryType
    });

    if (recursive && entry.isDirectory()) {
      const nestedEntries = await walkDirectory(absoluteEntryPath, options, recursive);
      results.push(...nestedEntries);
    }
  }

  return results;
}

export async function listFiles(
  input: ListFilesInput,
  root: string
): Promise<ListFilesResult> {
  const options: PathGuardOptions = { root };
  const targetPath = resolveScopedPath(input.path, options);
  const entries = await walkDirectory(targetPath, options, Boolean(input.recursive));

  entries.sort((left, right) => left.path.localeCompare(right.path));

  return {
    root: resolveScopedPath(".", options),
    target: toRelativeScopedPath(targetPath, options),
    entries
  };
}