import { useMemo } from 'react'
import { cn } from '@/lib/cn'
import { parseAnsi, type AnsiColor } from './ansi'

/** Terminal palette tuned for the dark glass background (readable on light too). */
const COLOR_CLASS: Record<AnsiColor, string> = {
  black: 'text-[#6b7280]',
  red: 'text-[#f87171]',
  green: 'text-[#4ade80]',
  yellow: 'text-[#facc15]',
  blue: 'text-[#60a5fa]',
  magenta: 'text-[#e879f9]',
  cyan: 'text-[#22d3ee]',
  white: 'text-[#e5e7eb]',
  'bright-black': 'text-[#9ca3af]',
  'bright-red': 'text-[#fca5a5]',
  'bright-green': 'text-[#86efac]',
  'bright-yellow': 'text-[#fde047]',
  'bright-blue': 'text-[#93c5fd]',
  'bright-magenta': 'text-[#f0abfc]',
  'bright-cyan': 'text-[#67e8f9]',
  'bright-white': 'text-[#f9fafb]'
}

/** Renders a console line with its ANSI colours as spans. */
export function AnsiText({ text, className }: { text: string; className?: string }) {
  const spans = useMemo(() => parseAnsi(text), [text])
  return (
    <span className={className}>
      {spans.map((span, i) =>
        span.color || span.bold ? (
          <span key={i} className={cn(span.color && COLOR_CLASS[span.color], span.bold && 'font-semibold')}>
            {span.text}
          </span>
        ) : (
          span.text
        )
      )}
    </span>
  )
}
