#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { scanBundle } from './auditors/bundle.js';
import { runDeadCodeScan } from './auditors/deadcode.js';
import { PerfpatchError, runLighthouse } from './auditors/lighthouse.js';
import { buildFixBrief } from './ai/brief.js';
import { generateRuleFixes } from './ai/rule-fixes.js';
import { rankFixes } from './ai/models.js';
import { DEFAULT_BRIEF_FILE, VERSION } from './config.js';
import { applyFix } from './patcher/apply.js';
import { colorizeDiff } from './patcher/diff.js';
import { runCommand } from './patcher/run-command.js';
import { render } from './reporter.js';
import { detectStack, hasPackageJson, unknownStack } from './stack-detect.js';
import type {
  AuditResults,
  Category,
  CliOptions,
  FileContext,
  Fix,
  Framework,
  OutputFormat,
  StackInfo,
} from './types.js';

function fail(message: string, hint?: string): never {
  console.error(chalk.red(`\n✖ ${message}`));
  if (hint) console.error(chalk.dim(hint));
  process.exit(1);
}

function parseBudget(value: string): { metric: string; threshold: number } | undefined {
  const m = value.match(/^(\w+)=(\d+)$/);
  if (!m) fail(`Invalid --budget "${value}". Use e.g. --budget perf=90`);
  return { metric: m![1]!, threshold: Number(m![2]) };
}

function shouldRun(category: Category, target: 'perf' | 'bundle' | 'deadcode'): boolean {
  return category === 'all' || category === target;
}

/** Gather small, relevant file context for the LLM brief (never full files). */
function gatherFileContext(localPath: string): FileContext[] {
  const ctx: FileContext[] = [];
  const pkgPath = join(localPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const slim = {
        dependencies: pkg['dependencies'] ?? {},
        devDependencies: pkg['devDependencies'] ?? {},
        browserslist: pkg['browserslist'],
      };
      ctx.push({ path: 'package.json', content: JSON.stringify(slim, null, 2) });
    } catch {
      /* ignore */
    }
  }
  return ctx;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function runAudits(opts: CliOptions): Promise<AuditResults> {
  const audits: AuditResults = {};

  // URL → Lighthouse (independent of local; PRD §15.7).
  if (opts.url && shouldRun(opts.category, 'perf')) {
    const spinner = ora('Running Lighthouse…').start();
    try {
      audits.lighthouse = await runLighthouse(opts.url, {
        device: opts.mobile ? 'mobile' : 'desktop',
      });
      spinner.succeed(`Lighthouse — perf ${audits.lighthouse.scores.performance}`);
    } catch (err) {
      spinner.fail('Lighthouse failed');
      const e = err as PerfpatchError;
      if (!opts.local) fail(e.message, e.hint);
      console.error(chalk.yellow(`  ${e.message}`));
      if (e.hint) console.error(chalk.dim(`  ${e.hint}`));
    }
  }

  if (opts.local) {
    const localPath = resolve(opts.local);
    if (!hasPackageJson(localPath)) {
      fail('No package.json found.', 'Is this the root of a JS/TS project?');
    }

    if (shouldRun(opts.category, 'bundle')) {
      const spinner = ora('Scanning bundle…').start();
      try {
        audits.bundle = scanBundle(localPath);
        spinner.succeed(`Bundle — ${Math.round(audits.bundle.totalEstimatedSize / 1024)}KB JS`);
      } catch (err) {
        spinner.fail(`Bundle scan failed: ${(err as Error).message}`);
      }
    }

    if (shouldRun(opts.category, 'deadcode')) {
      const spinner = ora('Scanning dead code (Knip)…').start();
      try {
        audits.deadcode = await runDeadCodeScan(localPath);
        const d = audits.deadcode;
        spinner.succeed(
          `Dead code — ${d.unusedDependencies.length} unused dep(s), ${d.unusedFiles.length} file(s)`,
        );
      } catch (err) {
        spinner.fail(`Dead code scan failed: ${(err as Error).message}`);
      }
    }
  }

  return audits;
}

function checkBudget(opts: CliOptions, audits: AuditResults): void {
  if (!opts.budget || !audits.lighthouse) return;
  const { metric, threshold } = opts.budget;
  const scores = audits.lighthouse.scores;
  const map: Record<string, number | undefined> = {
    perf: scores.performance,
    performance: scores.performance,
    a11y: scores.accessibility,
    accessibility: scores.accessibility,
    seo: scores.seo,
    bp: scores.bestPractices,
  };
  const actual = map[metric];
  if (actual == null) {
    console.error(chalk.yellow(`Unknown budget metric "${metric}" — skipping check.`));
    return;
  }
  if (actual < threshold) fail(`Budget failed: ${metric} ${actual} < ${threshold}`);
  console.log(chalk.green(`✓ Budget passed: ${metric} ${actual} >= ${threshold}`));
}

/** Apply deterministic fixes (patches + commands) with confirmation. */
async function applyFixes(fixes: Fix[], localPath: string, autoApply: boolean): Promise<void> {
  const actionable = fixes.filter((f) => (f.patch && f.file_path) || f.command);
  if (actionable.length === 0) return;

  console.log(chalk.bold(`\nApplying ${actionable.length} deterministic fix(es)…\n`));
  for (const fix of actionable) {
    console.log(chalk.bold(`▸ ${fix.title}`));
    if (fix.patch && fix.file_path) {
      console.log(chalk.dim(`  ${fix.file_path}`));
      console.log(colorizeDiff(fix.patch, chalk));
      const proceed = autoApply || (await confirm(`Apply patch to ${fix.file_path}?`));
      if (!proceed) {
        console.log(chalk.dim('  skipped\n'));
        continue;
      }
      const result = applyFix(fix, localPath);
      if (result.applied) {
        console.log(chalk.green(`  ✓ applied → ${result.filesChanged.join(', ')}`));
        console.log(chalk.dim(`  backup: ${result.backupPath}\n`));
      } else {
        console.log(chalk.yellow(`  ⚠ could not apply cleanly — manual fix required (${result.reason})\n`));
      }
    } else if (fix.command) {
      console.log(chalk.cyan(`  $ ${fix.command}`));
      const proceed = autoApply || (await confirm('Run this command?'));
      if (!proceed) {
        console.log(chalk.dim('  skipped\n'));
        continue;
      }
      const res = await runCommand(fix.command, localPath);
      console.log(res.ok ? chalk.green('  ✓ done\n') : chalk.yellow(`  ⚠ failed: ${res.output}\n`));
    }
  }
}

async function main(): Promise<void> {
  // Shortcut: `perfpatch --mcp` boots the MCP server (so a single npx command
  // works in MCP client configs). The imported module starts itself.
  if (process.argv.includes('--mcp')) {
    await import('./mcp.js');
    return;
  }

  const program = new Command();
  program
    .name('perfpatch')
    .description('Agentic frontend health CLI — audit and fix Lighthouse, bundle, and dead code. No API key needed.')
    .version(VERSION, '-v, --version')
    .argument('[url]', 'URL to audit with Lighthouse')
    .option('--local <path>', 'audit a local codebase (bundle + dead code)')
    .option('--stack <name>', 'skip auto-detect: nextjs | astro | remix | vite | generic')
    .option('--dry-run', 'show fixes but do not write files', false)
    .option('--apply', 'apply deterministic fixes without per-item prompts', false)
    .option('--category <name>', 'perf | bundle | deadcode | all', 'all')
    .option('--output <format>', 'terminal | json | markdown', 'terminal')
    .option('--save <path>', 'save the report to a file')
    .option('--prompt <path>', `write the LLM fix brief to this path (default ${DEFAULT_BRIEF_FILE})`)
    .option('--no-prompt', 'do not write the LLM fix brief')
    .option('--budget <expr>', 'fail if score below threshold, e.g. perf=90')
    .option('--mobile', 'run Lighthouse in mobile mode', false)
    .option('--verbose', 'show full audit data', false)
    .parse();

  const args = program.args;
  const raw = program.opts();

  // commander: --no-prompt sets prompt=false; --prompt <p> sets a string;
  // default (neither) → write to DEFAULT_BRIEF_FILE.
  const promptOpt: string | false =
    raw['prompt'] === false ? false : typeof raw['prompt'] === 'string' ? raw['prompt'] : DEFAULT_BRIEF_FILE;

  const opts: CliOptions = {
    url: args[0],
    local: raw['local'],
    stack: raw['stack'] as Framework | undefined,
    dryRun: Boolean(raw['dryRun']),
    apply: Boolean(raw['apply']),
    category: (raw['category'] as Category) ?? 'all',
    output: (raw['output'] as OutputFormat) ?? 'terminal',
    save: raw['save'],
    prompt: promptOpt,
    budget: raw['budget'] ? parseBudget(raw['budget']) : undefined,
    mobile: Boolean(raw['mobile']),
    verbose: Boolean(raw['verbose']),
  };

  if (!opts.url && !opts.local) {
    fail(
      'Provide a URL and/or --local <path>.',
      'Examples:\n  perfpatch https://yoursite.com\n  perfpatch --local ./',
    );
  }

  const isTerminal = opts.output === 'terminal';

  // Stack detection (must run before fixes; PRD §15.5). For URL-only audits
  // there's no codebase to inspect, so use an unknown stack rather than
  // scanning whatever directory the user happens to be in.
  const stack: StackInfo = opts.local
    ? detectStack(resolve(opts.local), opts.stack)
    : unknownStack(opts.stack);

  const audits = await runAudits(opts);

  // Budget check is a CI gate.
  checkBudget(opts, audits);

  // Deterministic, no-LLM fixes.
  const ruleFixes = rankFixes(generateRuleFixes(audits, stack));

  // Render & output the report.
  const reportInput = {
    stack,
    audits,
    fixes: ruleFixes,
    url: opts.url,
    localPath: opts.local ? resolve(opts.local) : undefined,
    verbose: opts.verbose,
  };
  const report = render(opts.output, reportInput);
  console.log(report);

  if (opts.save) {
    writeFileSync(opts.save, report, 'utf8');
    if (isTerminal) console.log(chalk.dim(`\nSaved report to ${opts.save}`));
  }

  // Write the LLM fix brief for contextual code fixes (no API call).
  if (opts.prompt !== false) {
    const fileContext = opts.local ? gatherFileContext(resolve(opts.local)) : [];
    const brief = buildFixBrief({
      audits,
      stack,
      fileContext,
      ruleFixes,
      url: opts.url,
      localPath: opts.local ? resolve(opts.local) : undefined,
    });
    writeFileSync(opts.prompt, brief, 'utf8');
    if (isTerminal) {
      console.log(
        chalk.dim('\n💡 Contextual code fixes written to ') +
          chalk.cyan(opts.prompt) +
          chalk.dim(
            ' — open it in Claude Code / Cursor and let your IDE agent apply them,\n   or add the perfpatch MCP server so the agent can drive the audits + patches directly.',
          ),
      );
    }
  }

  // Apply the deterministic fixes (local only).
  if (opts.local && !opts.dryRun && (opts.apply || isTerminal) && ruleFixes.length > 0) {
    await applyFixes(ruleFixes, resolve(opts.local), opts.apply);
  }
}

main().catch((err: unknown) => {
  if (err instanceof PerfpatchError) fail(err.message, err.hint);
  fail(`Unexpected error: ${(err as Error).message}`);
});
