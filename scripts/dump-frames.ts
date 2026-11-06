// Dumps the banner's frames, as the mod draws them, for render-media.py.
// usage: bun scripts/dump-frames.ts <out.json> [columns]
import { writeFileSync } from 'node:fs'

import type { HeaderInfo } from '../hooks/banner'
import { frame, ROWS, TRANSFORMED } from '../hooks/banner'

const out = process.argv[2] ?? 'frames.json'
const columns = Number(process.argv[3] ?? 88)
// Demo values, so no one's own model, plan or folder shows.
const info: HeaderInfo = {
  version: '2.1.318',
  model: 'Opus 5.5 with high effort',
  cwd: '~/projects/neon-city',
  notice: '',
}

const frames = []
// The transformation, then a stretch of idling with one glitch in it.
for (let tick = 0; tick <= TRANSFORMED + 66; tick++) {
  const words = frame(tick, columns, info)
  const cells = []
  for (let i = 0; i < words.length; i += 3) cells.push([words[i]!, words[i + 1]!, words[i + 2]!])
  frames.push(cells)
}

writeFileSync(out, JSON.stringify({ columns, rows: ROWS, version: info.version, model: info.model, cwd: info.cwd, frames }))
