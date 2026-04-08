import { isAbsolute, relative, resolve, sep } from "node:path";

export interface PathGuardOptions {
  root: string;
}

export class PathScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathScopeError";
  }
}

function normalizeRoot(root: string): string {
  if (!root || !root.trim()) {
    throw new PathScopeError("A workspace root is required.");
  }

  return resolve(root);
}

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

export function assertPathWithinRoot(targetPath: string, root: string): void {
  const resolvedRoot = normalizeRoot(root);
  const resolvedTarget = resolve(targetPath);
  const relativePath = relative(resolvedRoot, resolvedTarget);

  if (
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new PathScopeError(
      `Path "${resolvedTarget}" is outside the allowed root "${resolvedRoot}".`
    );
  }
}

export function resolveScopedPath(
  inputPath: string | undefined,
  options: PathGuardOptions
): string {
  const resolvedRoot = normalizeRoot(options.root);
  const requestedPath = inputPath?.trim() ? inputPath.trim() : ".";
  const resolvedTarget = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(resolvedRoot, requestedPath);

  assertPathWithinRoot(resolvedTarget, resolvedRoot);

  return resolvedTarget;
}

export function toRelativeScopedPath(
  absPath: string,
  options: PathGuardOptions
): string {
  const resolvedRoot = normalizeRoot(options.root);
  const resolvedTarget = resolve(absPath);

  assertPathWithinRoot(resolvedTarget, resolvedRoot);

  const relativePath = relative(resolvedRoot, resolvedTarget);

  return relativePath ? toPosixPath(relativePath) : ".";
}