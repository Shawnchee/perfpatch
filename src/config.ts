/**
 * Central configuration constants.
 *
 * perfpatch makes NO external API calls. Deterministic fixes are generated
 * locally; contextual code fixes are handed to whatever LLM the user already
 * has (their IDE agent, or the host model via the MCP server).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default filename for the LLM fix brief written by the CLI. */
export const DEFAULT_BRIEF_FILE = 'perfpatch-fixes.md';

/** Lighthouse run timeout for very slow sites (PRD §8). */
export const LIGHTHOUSE_TIMEOUT_MS = 60_000;

/** Suffix appended to backup files before patching (PRD §10). */
export const BACKUP_SUFFIX = '.perfpatch-backup';

/** Tool version, surfaced in the banner and JSON output. Read from package.json
 * (single source of truth) so the banner can never drift from the published version. */
function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
