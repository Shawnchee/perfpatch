import { execa } from 'execa';

export interface CommandResult {
  ok: boolean;
  output: string;
}

/**
 * Run a shell command inside the project directory (e.g. a dependency removal).
 * Commands are only ever run after explicit user confirmation in the CLI —
 * this helper does not prompt itself.
 */
export async function runCommand(command: string, cwd: string): Promise<CommandResult> {
  try {
    const res = await execa(command, { cwd, shell: true, timeout: 120_000 });
    return { ok: true, output: res.stdout || res.stderr || '' };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}
