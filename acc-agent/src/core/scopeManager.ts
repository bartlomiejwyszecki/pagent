import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ScopeManagerOptions {
  workspaceRoot: string;
  allowedDirectories?: string[];
  allowedExtensions?: string[];
  allowHiddenPaths?: boolean;
  maxReadChars?: number;
  maxFileSizeBytes?: number;
  maxListResults?: number;
  maxRecursionDepth?: number;
}

export interface ScopePolicy {
  workspaceRoot: string;
  allowedDirectories: string[];
  allowedExtensions: string[];
  allowHiddenPaths: boolean;
  maxReadChars: number;
  maxFileSizeBytes: number;
  maxListResults: number;
  maxRecursionDepth: number;
}

export class ScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolationError";
  }
}

const DEFAULT_ALLOWED_EXTENSIONS = [".ts", ".tsx", ".java", ".cs", ".md"];
const DEFAULT_MAX_READ_CHARS = 10_000;
const DEFAULT_MAX_FILE_SIZE_BYTES = 256 * 1024;
const DEFAULT_MAX_LIST_RESULTS = 500;
const DEFAULT_MAX_RECURSION_DEPTH = 8;

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

function normalizeDirectoryPath(inputPath: string): string {
  const trimmedPath = inputPath.trim();

  if (!trimmedPath) {
    throw new ScopeViolationError("Directory paths cannot be empty.");
  }

  return trimmedPath === "." ? "." : toPosixPath(trimmedPath).replace(/\/+$/, "");
}

function normalizeExtension(extension: string): string {
  const trimmedExtension = extension.trim().toLowerCase();

  if (!trimmedExtension) {
    throw new ScopeViolationError("Extensions cannot be empty.");
  }

  return trimmedExtension.startsWith(".") ? trimmedExtension : `.${trimmedExtension}`;
}

function ensureWithinRoot(root: string, targetPath: string): void {
  const relativePath = relative(root, targetPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new ScopeViolationError(
      `Path "${targetPath}" is outside the allowed workspace root "${root}".`
    );
  }
}

function containsHiddenSegment(relativePath: string): boolean {
  if (!relativePath || relativePath === ".") {
    return false;
  }

  return toPosixPath(relativePath)
    .split("/")
    .some((segment) => segment.startsWith("."));
}

export class ScopeManager {
  private readonly policy: ScopePolicy;
  private readonly allowedAbsoluteDirectories: string[];

  constructor(options: ScopeManagerOptions) {
    const workspaceRoot = resolve(options.workspaceRoot);

    if (!options.workspaceRoot.trim()) {
      throw new ScopeViolationError("A workspaceRoot is required.");
    }

    const allowedDirectories = (options.allowedDirectories?.length
      ? options.allowedDirectories
      : ["."]).map(normalizeDirectoryPath);

    const allowedExtensions = (options.allowedExtensions?.length
      ? options.allowedExtensions
      : DEFAULT_ALLOWED_EXTENSIONS).map(normalizeExtension);

    this.policy = {
      workspaceRoot,
      allowedDirectories,
      allowedExtensions,
      allowHiddenPaths: options.allowHiddenPaths ?? false,
      maxReadChars: options.maxReadChars ?? DEFAULT_MAX_READ_CHARS,
      maxFileSizeBytes: options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
      maxListResults: options.maxListResults ?? DEFAULT_MAX_LIST_RESULTS,
      maxRecursionDepth: options.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH
    };

    this.allowedAbsoluteDirectories = allowedDirectories.map((directory) => {
      const absoluteDirectory = resolve(workspaceRoot, directory);
      ensureWithinRoot(workspaceRoot, absoluteDirectory);
      return absoluteDirectory;
    });
  }

  getPolicy(): ScopePolicy {
    return {
      ...this.policy,
      allowedDirectories: [...this.policy.allowedDirectories],
      allowedExtensions: [...this.policy.allowedExtensions]
    };
  }

  resolveDirectoryPath(inputPath?: string): string {
    const requestedPath = inputPath?.trim() ? inputPath.trim() : ".";
    const absolutePath = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(this.policy.workspaceRoot, requestedPath);

    ensureWithinRoot(this.policy.workspaceRoot, absolutePath);
    this.assertDirectoryAllowed(absolutePath);

    return absolutePath;
  }

  resolveFilePath(inputPath: string): string {
    const requestedPath = inputPath?.trim();

    if (!requestedPath) {
      throw new ScopeViolationError("File paths cannot be empty.");
    }

    const absolutePath = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(this.policy.workspaceRoot, requestedPath);

    ensureWithinRoot(this.policy.workspaceRoot, absolutePath);
    this.assertDirectoryAllowed(absolutePath);
    this.assertExtensionAllowed(absolutePath);

    return absolutePath;
  }

  toRelativePath(absolutePath: string): string {
    const resolvedPath = resolve(absolutePath);

    ensureWithinRoot(this.policy.workspaceRoot, resolvedPath);

    const relativePath = relative(this.policy.workspaceRoot, resolvedPath);

    return relativePath ? toPosixPath(relativePath) : ".";
  }

  isHiddenPath(relativePath: string): boolean {
    return containsHiddenSegment(relativePath);
  }

  isPathVisible(relativePath: string): boolean {
    if (this.policy.allowHiddenPaths) {
      return true;
    }

    return !this.isHiddenPath(relativePath);
  }

  isExtensionAllowed(filePath: string): boolean {
    const extension = extname(filePath).toLowerCase();
    return this.policy.allowedExtensions.includes(extension);
  }

  assertExtensionAllowed(filePath: string): void {
    if (!this.isExtensionAllowed(filePath)) {
      throw new ScopeViolationError(
        `File "${this.toRelativePath(filePath)}" does not match the allowed extension policy.`
      );
    }
  }

  isDirectoryAllowed(targetPath: string): boolean {
    const resolvedPath = resolve(targetPath);

    return this.allowedAbsoluteDirectories.some((allowedDirectory) => {
      const relativePath = relative(allowedDirectory, resolvedPath);
      return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
    });
  }

  assertDirectoryAllowed(targetPath: string): void {
    if (!this.isDirectoryAllowed(targetPath)) {
      throw new ScopeViolationError(
        `Path "${this.toRelativePath(targetPath)}" is outside the allowed directory scope.`
      );
    }
  }

  assertReadCharLimit(content: string): void {
    if (content.length > this.policy.maxReadChars) {
      throw new ScopeViolationError(
        `Content exceeds the maximum read size of ${this.policy.maxReadChars} characters.`
      );
    }
  }

  truncateToReadLimit(content: string): { content: string; truncated: boolean } {
    if (content.length <= this.policy.maxReadChars) {
      return { content, truncated: false };
    }

    return {
      content: content.slice(0, this.policy.maxReadChars),
      truncated: true
    };
  }

  assertFileSizeAllowed(fileSizeBytes: number): void {
    if (fileSizeBytes > this.policy.maxFileSizeBytes) {
      throw new ScopeViolationError(
        `File size ${fileSizeBytes} exceeds the maximum allowed size of ${this.policy.maxFileSizeBytes} bytes.`
      );
    }
  }

  assertListResultLimit(resultCount: number): void {
    if (resultCount > this.policy.maxListResults) {
      throw new ScopeViolationError(
        `Result count ${resultCount} exceeds the maximum allowed list size of ${this.policy.maxListResults}.`
      );
    }
  }

  assertRecursionDepth(depth: number): void {
    if (depth > this.policy.maxRecursionDepth) {
      throw new ScopeViolationError(
        `Recursion depth ${depth} exceeds the maximum allowed depth of ${this.policy.maxRecursionDepth}.`
      );
    }
  }
}