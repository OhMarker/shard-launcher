import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, Copy, Eraser, FileDown, Search, Terminal, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type ConsoleLevel, type ConsoleLine } from '@shared/types'
import { useInstance, useSelectedInstance } from '@/hooks/useInstances'
import { errorMessage, errorTitle, invoke } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useActiveLaunch, useLaunch } from '@/stores/launch'
import { useUi } from '@/stores/ui'
import { IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { AnsiText } from './AnsiText'
import {
  CONSOLE_RENDER_LIMIT,
  LEVEL_FILTERS,
  consoleToText,
  filterConsole,
  formatClock,
  type LevelFilter
} from './console-helpers'

const EMPTY: ConsoleLine[] = []

const LEVEL_CLASS: Record<ConsoleLevel, string> = {
  debug: 'text-fg-subtle',
  info: 'text-fg-muted',
  warn: 'text-warning',
  error: 'text-danger',
  fatal: 'text-danger font-semibold'
}

const LEVEL_TAG: Record<ConsoleLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL'
}

function ConsoleLineView({ line }: { line: ConsoleLine }) {
  return (
    <div className={cn('flex gap-3 px-1 hover:bg-white/3', line.stream === 'launcher' && 'italic')}>
      <span className="shrink-0 select-none text-fg-subtle/70 tabular-nums">{formatClock(line.ts)}</span>
      <span className={cn('w-7 shrink-0 select-none text-[10.5px] font-semibold tracking-wide', LEVEL_CLASS[line.level])}>
        {LEVEL_TAG[line.level]}
      </span>
      <AnsiText text={line.text} className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg" />
    </div>
  )
}

/**
 * Slide-up game console over the lower part of the Home page. Follows the active launch
 * (or the selected instance), renders the newest 1500 matching lines, and keeps the view
 * pinned to the bottom until the user scrolls up.
 */
export function ConsolePanel() {
  const open = useUi((s) => s.consoleOpen)
  const setOpen = useUi((s) => s.setConsoleOpen)
  const toast = useUi((s) => s.toast)
  const active = useActiveLaunch()
  const selected = useSelectedInstance()
  const instanceId = active?.instanceId ?? selected?.id ?? null
  const instance = useInstance(instanceId)
  const lines = useLaunch((s) => (instanceId ? s.console[instanceId] : undefined) ?? EMPTY)
  const loadConsole = useLaunch((s) => s.loadConsole)
  const clearConsole = useLaunch((s) => s.clearConsole)

  const [level, setLevel] = useState<LevelFilter>('all')
  const [query, setQuery] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const [exporting, setExporting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  const visible = useMemo(() => filterConsole(lines, level, query), [lines, level, query])

  // Hydrate from the main-process buffer whenever the drawer opens or switches instance.
  useEffect(() => {
    if (!open || !instanceId) return
    loadConsole(instanceId).catch(() => undefined)
  }, [open, instanceId, loadConsole])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && atBottom) el.scrollTop = el.scrollHeight
  }, [visible, atBottom, open])

  const jumpToBottom = (): void => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    setAtBottom(true)
  }

  const copyAll = (): void => {
    void invoke('app:copyToClipboard', { text: consoleToText(visible) })
      .then(() => toast({ kind: 'success', title: `Copied ${visible.length} lines` }))
      .catch((err: unknown) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) }))
  }

  const exportLog = async (): Promise<void> => {
    if (!instanceId) return
    setExporting(true)
    try {
      const path = await invoke('launch:exportConsole', { instanceId })
      if (!path) {
        toast({ kind: 'info', title: 'Nothing to export yet' })
        return
      }
      toast({
        kind: 'success',
        title: 'Console exported',
        message: path,
        action: {
          label: 'Show in folder',
          onClick: () =>
            void invoke('app:showItemInFolder', { path }).catch((err: unknown) =>
              toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
            )
        }
      })
    } catch (err) {
      toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  const status = active && active.instanceId === instanceId ? active.phase : null

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={panelRef}
          tabIndex={-1}
          role="region"
          aria-label="Game console"
          initial={{ y: '110%', opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '110%', opacity: 0.6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
          className="glass-strong absolute inset-x-6 bottom-4 z-20 flex h-[58%] min-h-[280px] flex-col overflow-hidden rounded-[18px] bg-[#0b0f18]/92 outline-none"
        >
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <span className="flex items-center gap-2 pr-1 text-sm font-semibold text-fg">
              <Terminal className="size-4 text-accent" />
              Console
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
              {status && (
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    status === 'running' && 'bg-success',
                    status === 'preparing' && 'bg-accent animate-[pulse-soft_1.4s_ease-in-out_infinite]'
                  )}
                  aria-hidden
                />
              )}
              <span className="truncate">{instance?.name ?? 'No instance selected'}</span>
            </span>
            <Tabs<LevelFilter>
              size="sm"
              value={level}
              onChange={setLevel}
              items={LEVEL_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
              className="ml-2"
            />
            <Input
              size="sm"
              leftIcon={<Search />}
              placeholder="Filter output…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter console output"
              className="w-56"
            />
            <div className="ml-auto flex items-center gap-0.5">
              <IconButton label="Copy all visible lines" size="sm" onClick={copyAll} disabled={visible.length === 0}>
                <Copy />
              </IconButton>
              <IconButton label="Export log to a file" size="sm" onClick={() => void exportLog()} disabled={!instanceId || exporting}>
                <FileDown className={cn(exporting && 'animate-[pulse-soft_1s_ease-in-out_infinite]')} />
              </IconButton>
              <IconButton
                label="Clear console"
                size="sm"
                onClick={() => {
                  if (instanceId) clearConsole(instanceId)
                }}
                disabled={!instanceId || lines.length === 0}
              >
                <Eraser />
              </IconButton>
              <IconButton label="Close console" size="sm" onClick={() => setOpen(false)}>
                <X />
              </IconButton>
            </div>
          </header>

          <div className="relative min-h-0 flex-1">
            <div
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget
                setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 12)
              }}
              className="scroll-area selectable h-full bg-black/30 px-2 py-2 font-mono text-[12px] leading-5"
            >
              {visible.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-fg-subtle">
                  {lines.length === 0 ? 'No output yet. Launch the game and its log shows up here.' : 'No lines match the current filter.'}
                </div>
              ) : (
                visible.map((line) => <ConsoleLineView key={line.id} line={line} />)
              )}
            </div>
            <AnimatePresence>
              {!atBottom && visible.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onClick={jumpToBottom}
                  className="press absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-[#0f1420] px-3 py-1.5 text-xs font-medium text-fg shadow-[0_8px_24px_-8px_rgb(0_0_0/0.8)] hover:bg-white/8"
                >
                  <ArrowDown className="size-3.5" /> Jump to bottom
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <footer className="flex items-center justify-between border-t border-line px-3 py-1 text-[11px] tabular-nums text-fg-subtle">
            <span>
              {visible.length === lines.length ? `${lines.length} lines` : `${visible.length} of ${lines.length} lines`}
              {visible.length === CONSOLE_RENDER_LIMIT && ` · showing the newest ${CONSOLE_RENDER_LIMIT}`}
            </span>
            <span>Esc to close</span>
          </footer>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
