/**
 * Central configuration constants.
 *
 * perfpatch makes NO external API calls. Deterministic fixes are generated
 * locally; contextual code fixes are handed to whatever LLM the user already
 * has (their IDE agent, or the host model via the MCP server).
 */

/** Default filename for the LLM fix brief written by the CLI. */
export const DEFAULT_BRIEF_FILE = 'perfpatch-fixes.md';

/** Lighthouse run timeout for very slow sites (PRD §8). */
export const LIGHTHOUSE_TIMEOUT_MS = 60_000;

/** Suffix appended to backup files before patching (PRD §10). */
export const BACKUP_SUFFIX = '.perfpatch-backup';

/** Tool version, surfaced in the banner and JSON output. */
export const VERSION = '0.1.0';
