// The CyberClawd banner that takes the startup logo's place: static, a scan
// line that draws it in, then the neon banner for good. Painted as Raster
// cells; pure: nothing here touches `$`.

export const ROWS = 9
export const TICK_MS = 80
const BOOT = 5 // static
const SCAN = ROWS // one row a tick
// The tick the banner is whole; it idles from then on.
export const TRANSFORMED = BOOT + SCAN

// What the stock header said, which the banner covers and says again.
export type HeaderInfo = { version: string; model: string; cwd: string; notice: string }

// Two pixels per terminal row, drawn as '▀' (top in fg, bottom in bg).
//   O body  o legs  K circuit trace  D chest LED  V visor  E eyes
//   M/m mohawk tip/base  C/c chrome arm light/dark  J arm joint  B boots
const SPRITE = [
  '...........M.M..........',
  '..........MmMm..........',
  '..........mmmm..........',
  '...OOOOOOOOOOOOOOOOOO...',
  '...OOOOOOOOOOOOOOOOOO...',
  '..VVVVVVVVVVVVVVVVVVVV..',
  '..VVVVEEVVVVVVVVEEVVVV..',
  '..VVVVEEVVVVVVVVEEVVVV..',
  '..VVVVVVVVVVVVVVVVVVVV..',
  'CCCOOOOOOOOOOOOOOOOOOOOO',
  'cJCOOOOOOOOOOOOOOOOOOOOO',
  'CCCOOOOKKKKOOOOOOOOOOOOO',
  '...OOOOOOOKOOOODOOOOO...',
  '...OOOOOOOKKKKKKOOOOO...',
  '...OOOOOOOOOOOOOOOOOO...',
  '....oo.oo......oo.oo....',
  '....oo.oo......oo.oo....',
  '....BB.BB......BB.BB....',
]

// The circuit trace in the order a data pulse runs along it, into the LED.
const TRACE = [
  [7, 11], [8, 11], [9, 11], [10, 11], [10, 12], [10, 13],
  [11, 13], [12, 13], [13, 13], [14, 13], [15, 13], [15, 12],
]

const CX = 2 // the sprite's first column
const TX = 30 // the text panel's first column
const FULL = 54 // the narrowest banner that has room for the text panel

const BG = 0x0c0a18
const PINK = 0xff2bd6
const CYAN = 0x2de2e6
const VIOLET = 0xa72cff
const GREEN = 0x39ff14
const WHITE = 0xffffff
const BODY_TOP = 0xe2876a
const BODY_BOTTOM = 0xbd5d3e
const LEGS = 0x9c4a33
const TRACE_DIM = 0x83371f
const VISOR_LEFT = 0x22f0ff
const VISOR_RIGHT = 0x8a5cff
const VISOR_GLINT = 0xeaffff
const EYES = 0xff3df2
const CHROME = 0xc3ccd9
const CHROME_DARK = 0x7a8496
const FLOOR = 0x8a1f73
const RAIN_HEAD = 0x4a5cc4
const RAIN_TAIL = 0x2d3672
// Column 0 under the notice holds Claude Code's own dim bar, drawn over the
// banner; the banner draws it on its other rows too, as one left edge.
const EDGE = 0x6c6c7c
const DEFAULT = 0x01000000 // the terminal's own color
const LABEL = 0x9aa3c7
const MUTED = 0x5b5f85

const GLITCH = ['▓', '▒', '░', '#', '%', '&', '/', '?']
const NOISE = ['░', '▒', '▓', '▀', '▄', '▌', '▐']

type Cell = { glyph: string; fg: number; bg: number }

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16

  return (x >>> 0) / 4294967296
}

function mix(a: number, b: number, t: number): number {
  const channel = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)

  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

function wave(tick: number, period: number, offset = 0): number {
  return (Math.sin(((tick + offset) / period) * Math.PI * 2) + 1) / 2
}

function code(x: number, y: number): string {
  return SPRITE[y]?.[x] ?? '.'
}

function visor(x: number, y: number, tick: number): number {
  const shade = y === 5 ? 0.2 : y === 8 ? -0.25 : 0
  const base = mix(VISOR_LEFT, VISOR_RIGHT, (x - 2) / 19)
  const lit = shade >= 0 ? mix(base, WHITE, shade) : mix(base, BG, -shade)
  // A glint sweeps across the visor, then rests.
  const glint = (tick % 32) + 1
  if (x === glint) return VISOR_GLINT
  if (x === glint - 1) return mix(lit, VISOR_GLINT, 0.5)

  return lit
}

function pixel(x: number, y: number, tick: number): number | null {
  switch (code(x, y)) {
    case 'O': {
      const base = mix(BODY_TOP, BODY_BOTTOM, (y - 3) / 11)
      // Neon rim light: magenta from the left, cyan from the right.
      if (code(x - 1, y) === '.') return mix(base, PINK, 0.45)
      if (code(x + 1, y) === '.') return mix(base, CYAN, 0.45)

      return base
    }
    case 'o':
      return LEGS
    case 'K': {
      const at = TRACE.findIndex(([tx, ty]) => tx === x && ty === y)
      const pulse = tick % 18

      return at === pulse ? CYAN : at === pulse - 1 ? mix(TRACE_DIM, CYAN, 0.4) : TRACE_DIM
    }
    case 'D':
      if (tick % 18 === TRACE.length - 1) return WHITE

      return Math.floor(tick / 6) % 2 === 0 ? PINK : CYAN
    case 'V':
      return visor(x, y, tick)
    case 'E':
      if (tick % 53 < 2) return visor(x, y, tick)

      return mix(EYES, WHITE, wave(tick, 20) * 0.35)
    case 'M':
      return mix(PINK, WHITE, wave(tick, 14, x) * 0.3)
    case 'm':
      return mix(VIOLET, PINK, wave(tick, 14, x))
    case 'C':
      return CHROME
    case 'c':
      return CHROME_DARK
    case 'J':
      return mix(0x0e4d1a, GREEN, wave(tick, 12))
    case 'B':
      return mix(CYAN, WHITE, wave(tick, 10) * 0.5)
    default:
      return null
  }
}

type Glitch = { from: number; to: number; dx: number }

function glitchAt(tick: number): Glitch | null {
  if (tick % 43 > 1) return null
  const from = 3 + Math.floor(hash(Math.floor(tick / 43)) * 10)

  return {
    from,
    to: from + 2 + Math.floor(hash(tick) * 3),
    dx: hash(tick + 7) < 0.5 ? -2 : 2,
  }
}

// The sprite's pixel as drawn: slipped sideways in a glitch band, with
// chromatic fringes where the slip leaves gaps.
function drawn(x: number, y: number, tick: number, glitch: Glitch | null): number | null {
  if (glitch === null || y < glitch.from || y > glitch.to) return pixel(x, y, tick)
  const sx = x - glitch.dx
  const own = pixel(sx, y, tick)
  if (own !== null) return own
  if (pixel(sx - 1, y, tick) !== null) return mix(BG, CYAN, 0.7)
  if (pixel(sx + 1, y, tick) !== null) return mix(BG, PINK, 0.7)

  return null
}

function rain(column: number, row: number, tick: number): Cell | null {
  if (hash(column * 7 + 3) < 0.45) return null
  const speed = hash(column * 13 + 1) < 0.5 ? 2 : 3
  const span = ROWS + 4 + Math.floor(hash(column * 17 + 5) * 8)
  const head = (Math.floor(tick / speed) + Math.floor(hash(column * 31) * span)) % span
  if (head === row) return { glyph: '│', fg: RAIN_HEAD, bg: BG }
  if (head - 1 === row) return { glyph: '╷', fg: RAIN_TAIL, bg: BG }

  return null
}

function noise(column: number, row: number, tick: number): Cell {
  if (hash(tick * 4099 + row * 977 + column) < 0.5) return { glyph: ' ', fg: BG, bg: BG }
  const pick = hash(tick * 7919 + row * 131 + column * 3)
  const color = pick < 0.4 ? PINK : pick < 0.8 ? CYAN : VIOLET
  const glyph = NOISE[Math.floor(hash(tick + row * 61 + column * 7) * NOISE.length)]!

  return { glyph, fg: mix(BG, color, 0.6), bg: BG }
}

type Line = Array<[text: string, color: (i: number) => number]>

function textPanel(tick: number, info: HeaderInfo, glitch: Glitch | null): Line[] {
  const flicker = hash(tick * 3 + 1) < 0.06
  const title = (i: number) => {
    const neon = mix(PINK, CYAN, i / 20)

    return flicker ? mix(BG, neon, 0.35) : neon
  }
  let name = 'C L A U D E   C O D E'
  if (glitch !== null) {
    name = [...name]
      .map((ch, i) =>
        ch !== ' ' && hash(tick * 97 + i) < 0.25
          ? GLITCH[Math.floor(hash(tick + i) * GLITCH.length)]!
          : ch,
      )
      .join('')
  }
  const strength = 5 + Math.floor(hash(Math.floor(tick / 4)) * 4)
  const percent = 60 + strength * 5 - Math.floor(hash(Math.floor(tick / 4) + 9) * 5)
  const isLit = Math.floor(tick / 5) % 2 === 0

  return [
    [[glitch === null ? name : ` ${name}`, title]],
    [['━'.repeat(21), i => mix(BG, title(i), 0.4)]],
    [
      ['NEURAL LINK ', () => CYAN],
      ['■', () => (isLit ? GREEN : mix(BG, GREEN, 0.3))],
      [' ONLINE', () => GREEN],
    ],
    [['> ', () => PINK], ['build ', () => LABEL], [`v${info.version}`, () => CYAN]],
    [['> ', () => PINK], ['model ', () => LABEL], [info.model, () => CYAN]],
    [['> ', () => PINK], ['node  ', () => LABEL], [info.cwd, () => CYAN]],
    [
      ['> ', () => PINK],
      ['sync  ', () => LABEL],
      ['▰'.repeat(strength) + '▱'.repeat(8 - strength), i => (i < strength ? CYAN : MUTED)],
      [` ${percent}%`, () => LABEL],
    ],
    [[info.notice, () => MUTED]],
  ]
}

function banner(tick: number, columns: number, info: HeaderInfo): Cell[] {
  const glitch = glitchAt(tick)
  const grid: Cell[] = []
  const pulse = tick % (columns + 12)

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column - CX
      const top = drawn(x, row * 2, tick, glitch)
      let bottom = drawn(x, row * 2 + 1, tick, glitch)
      if (row === ROWS - 1 && bottom === null) {
        // The neon floor, a light running along it.
        const near = Math.abs(column - pulse)
        bottom = near < 3 ? mix(FLOOR, PINK, 1 - near / 3) : FLOOR
      }
      if (top === null && bottom === null) {
        grid.push((row < ROWS - 1 && rain(column, row, tick)) || { glyph: ' ', fg: BG, bg: BG })
      } else {
        grid.push({ glyph: '▀', fg: top ?? BG, bg: bottom ?? BG })
      }
    }
  }

  if (columns >= FULL) {
    textPanel(tick, info, glitch).forEach((line, row) => {
      let column = TX
      for (const [text, color] of line) {
        ;[...text].forEach((glyph, i) => {
          if (column < columns) {
            grid[row * columns + column] =
              glyph === ' ' ? { glyph, fg: BG, bg: BG } : { glyph, fg: color(i), bg: BG }
          }
          column += 1
        })
      }
    })
  }

  return grid
}

// The banner as drawn this tick: static, then a scan line drawing it in row
// by row over the static, then whole.
function cells(tick: number, columns: number, info: HeaderInfo): Cell[] {
  const whole = banner(tick, columns, info)
  const line = tick < TRANSFORMED ? tick - BOOT : ROWS

  return whole.map((cell, i) => {
    const row = Math.floor(i / columns)
    const column = i % columns
    if (column === 0) return { glyph: '▎', fg: EDGE, bg: DEFAULT }
    if (row < line) return cell
    if (row === line) return { glyph: '▄', fg: CYAN, bg: BG }

    return noise(column, row, tick)
  })
}

// Row-major little-endian u32 triplets [codePoint, foreground, background].
export function frame(tick: number, columns: number, info: HeaderInfo): Uint32Array {
  const grid = cells(tick, columns, info)
  const words = new Uint32Array(grid.length * 3)
  grid.forEach((cell, i) => {
    words[i * 3] = cell.glyph.codePointAt(0) ?? 0x20
    words[i * 3 + 1] = cell.fg
    words[i * 3 + 2] = cell.bg
  })

  return words
}

export function encode(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer) as Uint8Array & { toBase64(): string }

  return bytes.toBase64()
}
