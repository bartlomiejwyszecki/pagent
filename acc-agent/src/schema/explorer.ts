import { z } from "zod";

export const listFilesInputSchema = z.object({
  path: z.string().trim().min(1).optional(),
  recursive: z.boolean().optional()
});

export const listFilesEntrySchema = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"])
});

export const listFilesResultSchema = z.object({
  root: z.string(),
  target: z.string(),
  entries: z.array(listFilesEntrySchema)
});

export const readFileInputSchema = z.object({
  path: z.string().trim().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional()
});

export const readFileResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  totalLines: z.number().int().positive()
});

export const searchCodeInputSchema = z.object({
  query: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  maxResults: z.number().int().positive().optional(),
  caseSensitive: z.boolean().optional()
});

export const searchCodeMatchSchema = z.object({
  path: z.string(),
  lineNumber: z.number().int().positive(),
  column: z.number().int().positive(),
  line: z.string()
});

export const searchCodeResultSchema = z.object({
  root: z.string(),
  target: z.string(),
  query: z.string(),
  matches: z.array(searchCodeMatchSchema)
});

export type ListFilesInputSchema = z.infer<typeof listFilesInputSchema>;
export type ListFilesResultSchema = z.infer<typeof listFilesResultSchema>;
export type ReadFileInputSchema = z.infer<typeof readFileInputSchema>;
export type ReadFileResultSchema = z.infer<typeof readFileResultSchema>;
export type SearchCodeInputSchema = z.infer<typeof searchCodeInputSchema>;
export type SearchCodeResultSchema = z.infer<typeof searchCodeResultSchema>;
