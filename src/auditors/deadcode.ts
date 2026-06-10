import * as knip from 'knip';
import * as knipSession from 'knip/session';
import { relative, resolve } from 'node:path';
import type { DeadCodeResult, UnusedExport } from '../types.js';

/** Knip's IssueRecords shape: { [filePath]: { [symbol]: Issue } }. */
type IssueRecords = Record<string, Record<string, unknown>>;

/**
 * Knip's programmatic API is a two-step: `createOptions` (from knip/session)
 * builds the full option object — including the catalog container that `main`
 * requires — then `main` (from knip) runs the analysis. Neither is typed at
 * the package root, so we type the slices we use here.
 */
interface KnipIssues {
  files: Set<string>;
  dependencies: IssueRecords;
  devDependencies: IssueRecords;
  unlisted: IssueRecords;
  exports: IssueRecords;
  types: IssueRecords;
}
type CreateOptions = (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
type KnipMain = (opts: Record<string, unknown>) => Promise<{ issues: KnipIssues }>;
const createOptions = (knipSession as unknown as { createOptions: CreateOptions }).createOptions;
const knipMain = (knip as unknown as { main: KnipMain }).main;

/** Files we never want to report as "unused" — they have implicit entry points. */
const IGNORE_FILE_PATTERNS = [
  /\.(test|spec)\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)__mocks__\//,
  /\.config\.[jt]s$/,
  /\.d\.ts$/,
];

const MAX_FILES_BEFORE_SUMMARY = 20;

function isIgnorableFile(path: string): boolean {
  return IGNORE_FILE_PATTERNS.some((re) => re.test(path));
}

/** Collect the symbol names across an IssueRecords map. */
function flattenSymbols(records: IssueRecords | undefined): string[] {
  if (!records) return [];
  const out: string[] = [];
  for (const byFile of Object.values(records)) {
    out.push(...Object.keys(byFile));
  }
  return out;
}

/** Collect exports as { file, name } pairs. */
function flattenExports(records: IssueRecords | undefined, cwd: string): UnusedExport[] {
  if (!records) return [];
  const out: UnusedExport[] = [];
  for (const [filePath, byName] of Object.entries(records)) {
    // Knip keys exports/types by paths relative to its own cwd; resolve against
    // the project root first so relative() doesn't anchor to process.cwd().
    const file = relative(cwd, resolve(cwd, filePath));
    if (isIgnorableFile(file)) continue;
    for (const name of Object.keys(byName)) out.push({ file, name });
  }
  return out;
}

/**
 * Run Knip via its programmatic API (never shell-exec — PRD §15.1) and shape
 * the structured output, filtering common false positives (PRD §8).
 */
export async function runDeadCodeScan(projectPath: string): Promise<DeadCodeResult> {
  const cwd = projectPath;
  const options = await createOptions({
    cwd,
    gitignore: true,
    isProduction: false,
    isStrict: false,
    isShowProgress: false,
    isCache: false,
  });
  const { issues } = await knipMain(options);

  // Files: a plain Set of absolute paths.
  const rawFiles = [...(issues.files ?? [])]
    .map((f) => relative(cwd, resolve(cwd, f)))
    .filter((f) => !isIgnorableFile(f));

  const truncatedFiles = rawFiles.length > MAX_FILES_BEFORE_SUMMARY;
  const unusedFiles = truncatedFiles ? rawFiles.slice(0, MAX_FILES_BEFORE_SUMMARY) : rawFiles;

  const unusedDependencies = flattenSymbols(issues.dependencies);
  const unusedDevDependencies = flattenSymbols(issues.devDependencies);
  const unlisted = flattenSymbols(issues.unlisted);
  const unusedExports = [
    ...flattenExports(issues.exports, cwd),
    ...flattenExports(issues.types, cwd),
  ];

  return {
    unusedFiles,
    unusedDependencies,
    unusedDevDependencies,
    unusedExports,
    unlisted,
    truncatedFiles,
    // A flood of "unused" files usually means a misconfigured entry point.
    confidence: truncatedFiles ? 'low' : 'high',
  };
}
