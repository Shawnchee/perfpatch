#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { scanBundle } from './auditors/bundle.js';
import { runDeadCodeScan } from './auditors/deadcode.js';
import { PerfpatchError, runLighthouse } from './auditors/lighthouse.js';
import { buildFixBrief } from './ai/brief.js';
import { generateRuleFixes } from './ai/rule-fixes.js';
import { VERSION } from './config.js';
import { applyFix, applyUnifiedDiff } from './patcher/apply.js';
import { detectStack } from './stack-detect.js';
import { verifyFix } from './verify.js';
import type { AuditResults, Fix, MetricName, StackInfo } from './types.js';

/** Wrap a result as MCP text content (JSON). */
function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string, hint?: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: hint ? `${message}\n${hint}` : message }],
  };
}

const server = new McpServer({ name: 'perfpatch', version: VERSION });

// In-memory store so generate_fixes → apply_fix can reference fixes by id
// within a session.
const fixStore = new Map<string, Fix>();

server.registerTool(
  'run_lighthouse_audit',
  {
    description: 'Run a local headless-Chrome Lighthouse audit against a URL. No Google API used.',
    inputSchema: {
      url: z.string().url(),
      categories: z.array(z.enum(['performance', 'accessibility', 'seo', 'best-practices'])).optional(),
      device: z.enum(['desktop', 'mobile']).optional(),
      throttling: z.boolean().optional(),
    },
  },
  async ({ url, categories, device, throttling }) => {
    try {
      const result = await runLighthouse(url, { categories, device, throttling });
      // Drop rawJson from the MCP payload — too large for context.
      const { rawJson: _omit, ...slim } = result;
      return jsonResult(slim);
    } catch (err) {
      if (err instanceof PerfpatchError) return errorResult(err.message, err.hint);
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'scan_bundle',
  {
    description: 'Scan a local project for heavy dependencies, duplicates, and bundle bloat.',
    inputSchema: { project_path: z.string() },
  },
  async ({ project_path }) => {
    try {
      return jsonResult(scanBundle(project_path));
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'run_dead_code_scan',
  {
    description: 'Run Knip (programmatic API) to find unused files, dependencies, and exports.',
    inputSchema: { project_path: z.string() },
  },
  async ({ project_path }) => {
    try {
      return jsonResult(await runDeadCodeScan(project_path));
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'detect_stack',
  {
    description: 'Detect framework, bundler, CSS approach, and tooling from a project directory.',
    inputSchema: { project_path: z.string() },
  },
  async ({ project_path }) => {
    try {
      return jsonResult(detectStack(project_path));
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'suggest_fixes',
  {
    description:
      'Return deterministic rule-based fixes (no LLM) plus a markdown "fix brief" describing the contextual code changes YOU (the host model) should make. No external API is called — you do the reasoning. After editing files, call apply_patch for any diffs, or apply_fix for the listed deterministic fixes.',
    inputSchema: {
      audit_results: z.object({}).passthrough(),
      stack_info: z.object({}).passthrough(),
      file_context: z
        .array(z.object({ path: z.string(), content: z.string() }))
        .optional(),
    },
  },
  ({ audit_results, stack_info, file_context }) => {
    try {
      const audits = audit_results as AuditResults;
      const stack = stack_info as unknown as StackInfo;
      const ruleFixes = generateRuleFixes(audits, stack);
      for (const f of ruleFixes) fixStore.set(f.id, f);
      const brief = buildFixBrief({ audits, stack, fileContext: file_context, ruleFixes });
      return jsonResult({ ruleFixes, brief });
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'apply_fix',
  {
    description:
      'Apply a deterministic fix returned by suggest_fixes (by id) to a project. Backs up files first; dry_run previews only.',
    inputSchema: {
      fix_id: z.string(),
      project_path: z.string(),
      dry_run: z.boolean().optional(),
    },
  },
  ({ fix_id, project_path, dry_run }) => {
    const fix = fixStore.get(fix_id);
    if (!fix) return errorResult(`Unknown fix id "${fix_id}". Run suggest_fixes first.`);
    try {
      return jsonResult(applyFix(fix, project_path, { dryRun: dry_run }));
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'apply_patch',
  {
    description:
      'Apply a unified-diff patch you authored to a file in the project. Safe: refuses paths outside the project / node_modules / lockfiles / .git, backs up the original, and never partial-applies. dry_run previews only.',
    inputSchema: {
      project_path: z.string(),
      file_path: z.string(),
      patch: z.string(),
      dry_run: z.boolean().optional(),
    },
  },
  ({ project_path, file_path, patch, dry_run }) => {
    try {
      return jsonResult(
        applyUnifiedDiff(project_path, file_path, patch, `host-patch:${file_path}`, { dryRun: dry_run }),
      );
    } catch (err) {
      return errorResult((err as Error).message);
    }
  },
);

server.registerTool(
  'verify_fix',
  {
    description: 'Re-run Lighthouse and compare a single metric to a baseline.',
    inputSchema: {
      url: z.string().url(),
      metric: z.enum(['performance', 'lcp', 'cls', 'inp', 'fcp', 'tbt', 'tti']),
      baseline: z.number(),
      device: z.enum(['desktop', 'mobile']).optional(),
    },
  },
  async ({ url, metric, baseline, device }) => {
    try {
      return jsonResult(await verifyFix(url, metric as MetricName, baseline, device));
    } catch (err) {
      if (err instanceof PerfpatchError) return errorResult(err.message, err.hint);
      return errorResult((err as Error).message);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never write to stdout — it's the MCP channel. Log to stderr.
  console.error(`perfpatch MCP server v${VERSION} ready (stdio).`);
}

main().catch((err: unknown) => {
  console.error(`perfpatch MCP fatal: ${(err as Error).message}`);
  process.exit(1);
});
