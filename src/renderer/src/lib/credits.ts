import licenseText from '../../../../LICENSE?raw'

export const CREDIT_LINE = 'Made by OhMarker with the help of swxyzx2'

export const LICENSE_TEXT = licenseText.trim()

/** The first line of LICENSE is the license's name ("MIT License"). */
export const LICENSE_NAME = LICENSE_TEXT.split(/\r?\n/, 1)[0]?.trim() || 'License'
