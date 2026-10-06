import { type SkinVariant } from './accounts'

export type SkinSource = 'file' | 'username' | 'url' | 'current'

export interface SavedSkin {
  id: string
  name: string
  variant: SkinVariant
  favorite: boolean
  createdAt: string
  source: SkinSource
  /** Where it came from: file name, username or URL. */
  sourceLabel: string | null
  /** PNG as a data URL, always 64x64 (legacy 64x32 skins are converted on import). */
  dataUrl: string
}
