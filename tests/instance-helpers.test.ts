import { describe, expect, it, vi } from 'vitest'

// tsconfig.node.json is a composite project that does not list renderer files, so the
// module is loaded at runtime and typed by hand instead of being imported statically.
interface InstanceHelpersModule {
  roundToStep(mb: number, step?: number): number
  maxMemoryMb(totalMemoryMb: number): number
  memoryWarningMb(totalMemoryMb: number): number
  recommendedMemoryMb(totalMemoryMb: number): number
  splitArgs(input: string): string[]
  joinArgs(args: readonly string[]): string
}
const { joinArgs, maxMemoryMb, memoryWarningMb, recommendedMemoryMb, roundToStep, splitArgs } =
  await vi.importActual<InstanceHelpersModule>('../src/renderer/src/components/instances/instance-helpers')

describe('memory helpers', () => {
  it('rounds down to 512 MB steps but never below one step', () => {
    expect(roundToStep(16384)).toBe(16384)
    expect(roundToStep(16000)).toBe(15872)
    expect(roundToStep(100)).toBe(512)
  })

  it('caps the slider at the system total and warns above half of it', () => {
    expect(maxMemoryMb(16384)).toBe(16384)
    expect(maxMemoryMb(700)).toBe(1024)
    expect(memoryWarningMb(16384)).toBe(8192)
    expect(memoryWarningMb(8000)).toBe(3584)
  })

  it('recommends a quarter of RAM within 2-8 GB and under the warning line', () => {
    expect(recommendedMemoryMb(8192)).toBe(2048)
    expect(recommendedMemoryMb(16384)).toBe(4096)
    expect(recommendedMemoryMb(32768)).toBe(8192)
    expect(recommendedMemoryMb(65536)).toBe(8192)
    expect(recommendedMemoryMb(4096)).toBe(2048)
    expect(recommendedMemoryMb(2048)).toBe(1024)
  })
})

describe('splitArgs', () => {
  it('splits on any whitespace and ignores leading/trailing/multiple spaces', () => {
    expect(splitArgs('  -Xmx4G\t-XX:+UseG1GC\n--foo  ')).toEqual(['-Xmx4G', '-XX:+UseG1GC', '--foo'])
    expect(splitArgs('')).toEqual([])
    expect(splitArgs('   ')).toEqual([])
  })

  it('keeps quoted groups together and drops the quotes', () => {
    expect(splitArgs('-Djava.library.path="C:\\Program Files\\x" --name \'my pack\'')).toEqual([
      '-Djava.library.path=C:\\Program Files\\x',
      '--name',
      'my pack'
    ])
  })

  it('supports escaped quotes and backslashes inside double quotes', () => {
    expect(splitArgs('"say \\"hi\\"" "back\\\\slash"')).toEqual(['say "hi"', 'back\\slash'])
  })

  it('keeps backslashes literal outside quotes and before other characters', () => {
    expect(splitArgs('C:\\Users\\me\\jdk\\bin\\java.exe -Dx=\\y')).toEqual(['C:\\Users\\me\\jdk\\bin\\java.exe', '-Dx=\\y'])
    expect(splitArgs('"C:\\Program Files\\Java"')).toEqual(['C:\\Program Files\\Java'])
  })

  it('preserves empty quoted arguments', () => {
    expect(splitArgs('--token ""')).toEqual(['--token', ''])
  })

  it('tolerates an unterminated quote by taking the rest of the input', () => {
    expect(splitArgs('--a "unterminated value')).toEqual(['--a', 'unterminated value'])
  })
})

describe('joinArgs', () => {
  it('quotes only what needs quoting', () => {
    expect(joinArgs(['-Xmx4G', 'two words', '', 'it"s'])).toBe('-Xmx4G "two words" "" "it\\"s"')
  })

  it('round-trips through splitArgs', () => {
    const args = ['-XX:+UseG1GC', 'C:\\Program Files\\Java', 'quote"inside', "single'quote", '', 'tab\there']
    expect(splitArgs(joinArgs(args))).toEqual(args)
  })
})
