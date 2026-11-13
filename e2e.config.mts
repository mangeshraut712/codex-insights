import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'
export default {
  tests: ['tests/tester-army/*.e2e.ts'],
  targets: [
    { name: 'cli', platform: 'cli' },
    { name: 'report-web', engine: web(), app: { url: process.env.INSIGHTS_E2E_URL || 'http://127.0.0.1:4319', command: { executable: process.execPath, args: ['scripts/tester-army-server.mjs'] } } },
  ],
  workers: 1,
  retries: 0,
  cache: 'off',
} satisfies E2EConfig
