import { z } from 'zod'

/** api.adoptium.net/v3/assets/latest/{major}/hotspot */
export const AdoptiumAssetSchema = z.object({
  binary: z.object({
    architecture: z.string(),
    image_type: z.string(),
    os: z.string(),
    package: z.object({
      checksum: z.string().optional(),
      checksum_link: z.string().optional(),
      link: z.string(),
      name: z.string(),
      size: z.number().optional()
    })
  }),
  release_name: z.string(),
  version: z.object({
    major: z.number(),
    minor: z.number().optional(),
    security: z.number().optional(),
    semver: z.string().optional(),
    openjdk_version: z.string().optional()
  })
})
export const AdoptiumAssetListSchema = z.array(AdoptiumAssetSchema)
export type AdoptiumAsset = z.infer<typeof AdoptiumAssetSchema>

/** api.github.com/repos/{owner}/{repo}/releases */
export const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  published_at: z.string().nullable(),
  html_url: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
  assets: z
    .array(
      z.object({
        name: z.string(),
        browser_download_url: z.string(),
        size: z.number()
      })
    )
    .default([])
})
export const GitHubReleaseListSchema = z.array(GitHubReleaseSchema)
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>
