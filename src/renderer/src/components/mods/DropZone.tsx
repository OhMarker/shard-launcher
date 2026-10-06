import { FileUp } from 'lucide-react'
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface DropZoneProps {
  /**
   * Called with the dropped file names, or null when the zone was clicked. The renderer cannot
   * read dropped file paths, so the handler opens a file picker either way.
   */
  onPick: (droppedNames: string[] | null) => void
  disabled?: boolean
  className?: string
}

export function DropZone({ onPick, disabled, className }: DropZoneProps) {
  const [over, setOver] = useState(false)
  // dragenter/dragleave fire for every child; count nesting so leaving a child does not flicker.
  const depth = useRef(0)

  const onDragEnter = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    depth.current += 1
    if (!disabled) setOver(true)
  }
  const onDragLeave = (): void => {
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setOver(false)
  }
  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
  }
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    if (disabled) return
    const names = Array.from(e.dataTransfer.files).map((f) => f.name)
    onPick(names.length ? names : null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(null)
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label="Drop jars here or click to browse"
      onClick={() => !disabled && onPick(null)}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-out-quint)]',
        over
          ? 'scale-[1.01] border-accent/70 bg-accent/10'
          : 'border-line-strong bg-white/3 hover:border-accent/40 hover:bg-white/5',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-[14px] border border-line bg-white/5 text-fg-muted transition-colors [&_svg]:size-5',
          over && 'border-accent/40 text-accent'
        )}
      >
        <FileUp />
      </span>
      <div className="text-sm font-medium text-fg">Drop jars here or click to browse</div>
      <div className="text-xs text-fg-subtle">.jar mods and .mrpack packs for this instance</div>
    </div>
  )
}
