import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const PACKAGE_VERSION = String(require('../package.json').version)
