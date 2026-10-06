import { Copy, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { invoke, isMac, useIpcEvent } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ShardMark, Wordmark } from '@/components/brand/Logo'
import { useActiveLaunch } from '@/stores/launch'

function WindowButton({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'no-drag flex h-9 w-11 items-center justify-center text-fg-muted transition-colors duration-150 [&_svg]:size-[14px]',
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-white/10 hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false)
  const active = useActiveLaunch()

  useEffect(() => {
    void invoke('window:isMaximized').then(setMaximized)
  }, [])
  useIpcEvent('window:maximized', setMaximized)

  return (
    <header className="drag-region relative z-30 flex h-9 shrink-0 items-center justify-between">
      <div className={cn('flex items-center gap-2 pl-3.5', isMac && 'pl-20')}>
        <ShardMark size={18} />
        <Wordmark className="text-[13px]" />
        <span className="ml-1 text-[11px] text-fg-subtle">Launcher</span>
        {active && (
          <span className="no-drag ml-3 flex items-center gap-1.5 rounded-full border border-line bg-white/5 px-2 py-0.5 text-[11px] text-fg-muted">
            <span
              className={cn(
                'size-1.5 rounded-full',
                active.phase === 'running' ? 'bg-success' : 'bg-accent animate-[pulse-soft_1.4s_ease-in-out_infinite]'
              )}
            />
            {active.phase === 'running' ? 'Game running' : (active.message ?? 'Preparing')}
          </span>
        )}
      </div>
      {!isMac && (
        <div className="flex h-full items-stretch">
          <WindowButton label="Minimize" onClick={() => void invoke('window:minimize')}>
            <Minus />
          </WindowButton>
          <WindowButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => void invoke('window:toggleMaximize')}>
            {maximized ? <Copy className="scale-x-[-1]" /> : <Square />}
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => void invoke('window:close')}>
            <X />
          </WindowButton>
        </div>
      )}
    </header>
  )
}
