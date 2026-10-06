import { AnimatePresence, motion } from 'framer-motion'
import { Link, Upload, UserRound } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { type SavedSkin } from '@shared/types'
import { invoke } from '@/lib/api'
import { PlayerHead } from '@/components/player/PlayerHead'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { SectionHeader } from '@/components/ui/Misc'
import { isHttpUrl, isValidUsername, variantLabel } from './skins-utils'
import { reportSkinError, type SkinMutations } from './useSkins'

const onEnter =
  (fn: () => void) =>
  (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      fn()
    }
  }

export function AddSkinCard({ m }: { m: SkinMutations }) {
  const [username, setUsername] = useState('')
  const [url, setUrl] = useState('')
  const [fetched, setFetched] = useState<SavedSkin | null>(null)

  const upload = async (): Promise<void> => {
    try {
      const paths = await invoke('app:pickFile', {
        title: 'Choose a skin',
        filters: [{ name: 'PNG image', extensions: ['png'] }]
      })
      const path = paths?.[0]
      if (path) m.addFromFile.mutate(path)
    } catch (err) {
      reportSkinError(err)
    }
  }

  const fetchUsername = (): void => {
    const name = username.trim()
    if (!isValidUsername(name)) return
    m.addFromUsername.mutate(name, {
      onSuccess: (skin) => {
        setFetched(skin)
        setUsername('')
      }
    })
  }

  const addUrl = (): void => {
    const value = url.trim()
    if (!isHttpUrl(value)) return
    m.addFromUrl.mutate(value, { onSuccess: () => setUrl('') })
  }

  const usernameValid = isValidUsername(username)
  const urlValid = isHttpUrl(url)

  return (
    <Card>
      <SectionHeader
        title="Add a skin"
        description="New skins land in your library. Apply them from there."
      />
      <div className="mt-4 space-y-4">
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Upload />}
          loading={m.addFromFile.isPending}
          onClick={() => void upload()}
        >
          Upload from file
        </Button>

        <Field
          label="Copy from username"
          hint="Grabs the skin another player is wearing right now."
        >
          <div className="flex items-start gap-2">
            <Input
              leftIcon={<UserRound />}
              placeholder="Player name"
              aria-label="Minecraft username"
              value={username}
              maxLength={16}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter(fetchUsername)}
              error={
                username.trim() && !usernameValid
                  ? 'Letters, digits and underscores, up to 16 characters.'
                  : null
              }
            />
            <Button
              variant="outline"
              disabled={!usernameValid}
              loading={m.addFromUsername.isPending}
              onClick={fetchUsername}
            >
              Fetch
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {fetched && (
              <motion.div
                key={fetched.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-3 rounded-[12px] border border-line bg-white/4 p-2.5"
                role="status"
              >
                <PlayerHead skinDataUrl={fetched.dataUrl} size={36} rounded="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">Added {fetched.name}</div>
                  <div className="truncate text-xs text-fg-subtle">
                    {fetched.sourceLabel ?? 'from username'} · {variantLabel(fetched.variant)}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Field>

        <Field label="From URL" hint="A direct link to a 64x64 skin PNG.">
          <div className="flex items-start gap-2">
            <Input
              leftIcon={<Link />}
              placeholder="https://…/skin.png"
              aria-label="Skin URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter(addUrl)}
              error={url.trim() && !urlValid ? 'Enter an http(s) link.' : null}
            />
            <Button
              variant="outline"
              disabled={!urlValid}
              loading={m.addFromUrl.isPending}
              onClick={addUrl}
            >
              Add
            </Button>
          </div>
        </Field>
      </div>
    </Card>
  )
}
