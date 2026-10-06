/**
 * Mojang rule evaluation. Pure: no Electron, no file system, so it is unit tested directly.
 *
 * Semantics (matching the vanilla launcher): an entry without rules is allowed. With rules,
 * the entry starts disallowed; every rule whose conditions match flips the state to its
 * action, so the last matching rule wins.
 */
import { release } from 'node:os'
import { type Rule } from '@shared/schemas/mojang'

export type OsName = 'windows' | 'osx' | 'linux'
export type OsArch = 'x86' | 'x64' | 'arm64'

export interface OsInfo {
  name: OsName
  arch: OsArch
  /** Kernel release string, matched against `os.version` regexes. */
  version: string
}

export type RuleFeatures = Readonly<Record<string, boolean>>

export interface RuleEnvironment {
  os: OsInfo
  features?: RuleFeatures
}

export function osNameFor(platform: NodeJS.Platform): OsName {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'osx'
  return 'linux'
}

export function osArchFor(arch: NodeJS.Architecture): OsArch {
  if (arch === 'ia32') return 'x86'
  if (arch === 'arm64') return 'arm64'
  return 'x64'
}

export function currentOs(): OsInfo {
  return { name: osNameFor(process.platform), arch: osArchFor(process.arch), version: release() }
}

/** Feature flags the launcher supports. Quick play and demo mode are never enabled. */
export function launchFeatures(opts: { fullscreen: boolean }): RuleFeatures {
  return {
    is_demo_user: false,
    has_custom_resolution: !opts.fullscreen,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  }
}

function regexMatches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

export function ruleMatches(rule: Rule, env: RuleEnvironment): boolean {
  if (rule.os) {
    if (rule.os.name !== undefined && rule.os.name !== env.os.name) return false
    if (rule.os.arch !== undefined && rule.os.arch !== env.os.arch) return false
    if (rule.os.version !== undefined && !regexMatches(rule.os.version, env.os.version)) return false
  }
  if (rule.features) {
    for (const [feature, expected] of Object.entries(rule.features)) {
      if ((env.features?.[feature] ?? false) !== expected) return false
    }
  }
  return true
}

export function rulesAllow(rules: readonly Rule[] | undefined, env: RuleEnvironment): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, env)) allowed = rule.action === 'allow'
  }
  return allowed
}
