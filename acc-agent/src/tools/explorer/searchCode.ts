import { readFile as readFileFromDisk, stat } from "node:fs/promises";
import { join } from "node:path";

import fg from "fast-glob";

import { ScopeManager } from "../../core/scopeManager";

export interface SearchCodeInput {
  query: string;
  path?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

export interface SearchCodeMatch {
  path: string;
  lineNumber: number;
  column: number;
  line: string;
}

export interface SearchCodeResult {
  root: string;
  target: string;
  query: string;
  matches: SearchCodeMatch[];
}

const DEFAULT_MAX_RESULTS = 50;

function createGlobPattern(targetRelativePath: string): string {
  return targetRelativePath === "." ? "**/*" : `${targetRelativePath}/**/*`;
}

function isBinaryContent(content: Buffer): boolean {
  const sampleSize = Math.min(content.length, 1024);

  for (let index = 0; index < sampleSize; index += 1) {
    if (content[index] === 0) {
      return true;
    }
  }

  return false;
}

function normalizeQuery(query: string): string {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty.");
  }

  return normalizedQuery;
}

function normalizeMaxResults(
  requestedMaxResults: number | undefined,
  hardLimit: number
): number {
  if (requestedMaxResults === undefined) {
    return Math.min(DEFAULT_MAX_RESULTS, hardLimit);
  }

  if (!Number.isInteger(requestedMaxResults) || requestedMaxResults < 1) {
    throw new Error("maxResults must be a positive integer.");
  }

  return Math.min(requestedMaxResults, hardLimit);
}

async function collectSearchableFiles(
  scopeManager: ScopeManager,
  targetPath: string
): Promise<string[]> {
  const policy = scopeManager.getPolicy();
  const targetRelativePath = scopeManager.toRelativePath(targetPath);
  const pattern = createGlobPattern(targetRelativePath);

  const matchedPaths = await fg(pattern, {
    cwd: policy.workspaceRoot,
    onlyFiles: true,
    dot: policy.allowHiddenPaths,
    unique: true,
    followSymbolicLinks: false
  });

  return matchedPaths
    .map((matchedPath) => join(policy.workspaceRoot, matchedPath))
    .filter((absolutePath) => scopeManager.isPathAllowed(absolutePath, "file"))
    .sort((left, right) => left.localeCompare(right));
}

function collectMatchesFromContent(
  content: string,
  relativePath: string,
  query: string,
  caseSensitive: boolean,
  remainingResults: number
): SearchCodeMatch[] {
  if (remainingResults <= 0) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const normalizedQuery = caseSensitive ? query : query.toLowerCase();
  const matches: SearchCodeMatch[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const searchableLine = caseSensitive ? line : line.toLowerCase();
    let fromIndex = 0;

    while (fromIndex <= searchableLine.length) {
      const matchIndex = searchableLine.indexOf(normalizedQuery, fromIndex);

      if (matchIndex === -1) {
        break;
      }

      matches.push({
        path: relativePath,
        lineNumber: lineIndex + 1,
        column: matchIndex + 1,
        line
      });

      if (matches.length >= remainingResults) {
        return matches;
      }

      fromIndex = matchIndex + Math.max(normalizedQuery.length, 1);
    }
  }

  return matches;
}

export async function searchCode(
  input: SearchCodeInput,
  root: string
): Promise<SearchCodeResult> {
  const scopeManager = new ScopeManager({
    workspaceRoot: root
  });

  const query = normalizeQuery(input.query);
  const targetPath = scopeManager.resolveDirectoryPath(input.path);
  const policy = scopeManager.getPolicy();
  const maxResults = normalizeMaxResults(input.maxResults, policy.maxListResults);
  const caseSensitive = input.caseSensitive ?? false;
  const searchableFiles = await collectSearchableFiles(scopeManager, targetPath);
  const matches: SearchCodeMatch[] = [];

  for (const filePath of searchableFiles) {
    const targetStats = await stat(filePath);

    if (!targetStats.isFile()) {
      continue;
    }

    scopeManager.assertFileSizeAllowed(targetStats.size);

    const buffer = await readFileFromDisk(filePath);

    if (isBinaryContent(buffer)) {
      continue;
    }

    const content = buffer.toString("utf8");
    const relativePath = scopeManager.toRelativePath(filePath);
    const fileMatches = collectMatchesFromContent(
      content,
      relativePath,
      query,
      caseSensitive,
      maxResults - matches.length
    );

    matches.push(...fileMatches);

    if (matches.length >= maxResults) {
      break;
    }
  }

  return {
    root: policy.workspaceRoot,
    target: scopeManager.toRelativePath(targetPath),
    query,
    matches
  };
}