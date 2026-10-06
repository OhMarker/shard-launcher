/** Platform naming for the Mojang and Adoptium runtime catalogues. Pure. */

export type AdoptiumOs = 'windows' | 'mac' | 'linux'
export type AdoptiumArch = 'x64' | 'aarch64' | 'x86'

/** Key into the Mojang `all.json` runtime catalogue, or null when Mojang ships nothing. */
export function mojangPlatformKey(platform: NodeJS.Platform, arch: NodeJS.Architecture): string | null {
  switch (platform) {
    case 'win32':
      if (arch === 'x64') return 'windows-x64'
      if (arch === 'arm64') return 'windows-arm64'
      if (arch === 'ia32') return 'windows-x86'
      return null
    case 'darwin':
      if (arch === 'x64') return 'mac-os'
      if (arch === 'arm64') return 'mac-os-arm64'
      return null
    case 'linux':
      if (arch === 'x64') return 'linux'
      if (arch === 'ia32') return 'linux-i386'
      return null
    default:
      return null
  }
}

export function adoptiumTarget(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): { os: AdoptiumOs; architecture: AdoptiumArch } | null {
  const os: AdoptiumOs | null =
    platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : null
  const architecture: AdoptiumArch | null =
    arch === 'x64' ? 'x64' : arch === 'arm64' ? 'aarch64' : arch === 'ia32' ? 'x86' : null
  if (!os || !architecture) return null
  return { os, architecture }
}

export function javaExecutableName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'java.exe' : 'java'
}

/** Well-known executable locations relative to a runtime's install folder, most likely first. */
export function javaExecutableCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return ['bin/java.exe']
  if (platform === 'darwin') return ['jre.bundle/Contents/Home/bin/java', 'Contents/Home/bin/java', 'bin/java']
  return ['bin/java']
}
