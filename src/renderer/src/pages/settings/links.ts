import { GITHUB_OWNER, GITHUB_REPO } from '@shared/constants'

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`
export const RELEASES_URL = `${REPO_URL}/releases`
/** README section that walks through the Azure app registration. */
export const README_MSA_URL = `${REPO_URL}#microsoft-sign-in`
