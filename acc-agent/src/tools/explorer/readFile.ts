import { readFile as readFileFromDisk, stat } from "node:fs/promises";

import { PathGuardOptions, resolveScopedPath, toRelativeScopedPath } from "./pathGuard";

export interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
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

function normalizeLineNumber(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Line numbers must be positive integers.");
  }

  return value;
}

export async function readFile(
  input: ReadFileInput,
  root: string
): Promise<ReadFileResult> {
  const options: PathGuardOptions = { root };
  const targetPath = resolveScopedPath(input.path, options);
  const targetStats = await stat(targetPath);

  if (!targetStats.isFile()) {
    throw new Error(`Path "${input.path}" is not a readable file.`);
  }

  const buffer = await readFileFromDisk(targetPath);

  if (isBinaryContent(buffer)) {
    throw new Error(`Path "${input.path}" appears to contain binary content.`);
  }

  const fullContent = buffer.toString("utf8");
  const lines = fullContent.split(/\r?\n/);
  const totalLines = lines.length;
  const requestedStartLine = normalizeLineNumber(input.startLine, 1);
  const requestedEndLine = normalizeLineNumber(input.endLine, totalLines);

  if (requestedStartLine > requestedEndLine) {
    throw new Error("startLine cannot be greater than endLine.");
  }

  const boundedStartLine = Math.min(requestedStartLine, totalLines);
  const boundedEndLine = Math.min(requestedEndLine, totalLines);
  const slicedLines = lines.slice(boundedStartLine - 1, boundedEndLine);

  return {
    path: toRelativeScopedPath(targetPath, options),
    content: slicedLines.join("\n"),
    startLine: boundedStartLine,
    endLine: boundedEndLine,
    totalLines
  };
}