// Centralized construction and sanitization of Codex CLI arguments
// Keep this module as the single place to define defaults and validate flags.

// Default bypass / execution flag. This is where we decide whether
// to run with approvals + sandboxing or in "yolo" mode.
export const BYPASS_FLAG = '--yolo'

// Default arguments for Codex CLI runs (after the exec subcommand)
export const DEFAULT_ARGS: string[] = ['-m', 'gpt-5.1', '-c', 'model_reasoning_effort=high']

function dedupeSingletonFlags(args: string[]): string[] {
  // Some flags should only appear once; keep the first occurrence.
  const seen = new Set<string>()
  const singletons = new Set<string>([BYPASS_FLAG])
  const result: string[] = []
  for (const token of args) {
    if (singletons.has(token)) {
      if (seen.has(token)) continue
      seen.add(token)
      result.push(token)
    } else {
      result.push(token)
    }
  }
  return result
}

export interface BuildArgsOptions {
  extraArgs?: string[]
  sessionId?: string
}

export function buildCodexArgs(opts: BuildArgsOptions = {}): string[] {
  const userArgs = Array.isArray(opts.extraArgs) ? opts.extraArgs.filter(Boolean) : []

  // Always include bypass flag here; keep it centralized and deduped locally
  const coreArgs = dedupeSingletonFlags([BYPASS_FLAG, ...DEFAULT_ARGS, ...userArgs])

  // Command and session handling. We want the final shape to look like:
  //   codex exec --yolo -m gpt-5.1 -c model_reasoning_effort=high [resume <id> -]
  const args: string[] = ['exec', ...coreArgs]
  if (opts.sessionId && opts.sessionId.trim().length > 0) {
    args.push('resume', opts.sessionId.trim(), '-')
  }

  return args
}
