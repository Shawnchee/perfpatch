import { createTwoFilesPatch } from 'diff';

/** Build a unified diff between two versions of a file's content. */
export function makeUnifiedDiff(
  filePath: string,
  before: string,
  after: string,
): string {
  return createTwoFilesPatch(filePath, filePath, before, after, '', '', { context: 3 });
}

/** Colorize a unified diff for terminal display. */
export function colorizeDiff(diff: string, chalk: import('chalk').ChalkInstance): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
      if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
      if (line.startsWith('@@')) return chalk.cyan(line);
      if (line.startsWith('+++') || line.startsWith('---')) return chalk.dim(line);
      return line;
    })
    .join('\n');
}
