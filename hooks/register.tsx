import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, OnScreen, Register, RenderElement, RenderViewport } from 'claude-code'

import type { IntroPhase } from '../types'
import type { HeaderInfo } from './banner'
import { encode, frame, ROWS, TICK_MS, TRANSFORMED } from './banner'
import { cyberWord } from './spinner'

// No mod draws the startup logo, and a drawing cannot leave the prompt's
// area, so CyberClawd is painted over the logo from a row under it, in the
// same scrolling region, and scrolls with the logo from there. The host is a
// startup notice under the logo where Claude Code shows one (`▎ Using …`),
// else the output of `/cyber-clawd`, which the mod runs once at startup.
type HostKind = 'notice' | 'command'
type Host = { kind: HostKind; requestId: string }
const PLACES: Record<HostKind, { top: number; left: number }> = {
  // The blank top row, the logo's three rows, a blank row, then the notice,
  // whose box starts two columns in, after its bar.
  notice: { top: -5, left: -2 },
  // The blank top row, the logo's three rows, two blank rows, the command's
  // own line, then its output, whose box starts at the left edge.
  command: { top: -7, left: 0 },
}
// How long a startup notice has to show up before the command is run.
const NOTICE_WAIT_MS = 600

const KEY = 'cyber-clawd'
// Change the tag when the phases change: an older value reads as `pending`.
const phase = atom({ plugin: 'cyber-clawd', key: 'phase' } as const, 'pending' as IntroPhase, {
  shape: 'phase-2',
})

export const register: Register = on => {
  let tick = 0
  // Where the banner is drawn and how: see `Live`.
  const live: Live = { host: null, isVisible: true, columns: 0 }
  let notice: string | null = null
  let isFullscreen = false
  const info: HeaderInfo = { version: '', model: '', cwd: '', notice: '' }

  // A keystroke or a prompt skips the rest of the transformation.
  const skip = () => {
    tick = Math.max(tick, TRANSFORMED)
  }

  on('session.start', async ($, e, next) => {
    // A fresh start has an empty conversation; a resume or a reload does not.
    const messages = await $.session.messages()
    const isFresh = Array.isArray(messages) && messages.length === 0
    const now = await read($, phase)
    info.version = (await $.session.version()).version
    const home = await $.env.get('HOME')
    info.cwd = home && e.cwd.startsWith(home) ? `~${e.cwd.slice(home.length)}` : e.cwd

    // The stock header's model line: `Opus 5.5 with high effort · Claude Pro`.
    // The plan is the account's, which only Claude Code's own config holds.
    let plan = ''
    try {
      const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? home
      const config: unknown = JSON.parse(await $.fs.read(`${configDir}/.claude.json`))
      plan = planName(config)
    } catch {
      // No config, or no account in it (an API key): no plan to show.
    }
    let isDescribing = false
    const describeModel = async () => {
      if (isDescribing) return
      isDescribing = true
      try {
        const model = await $.session.model()
        const label = pickerLabel(await $.settings.read({ key: 'modelPicker' }), model)
        const effort =
          effortFor(await $.settings.read({ key: 'modelSettings' }), model) ??
          stringOr(await $.settings.read({ key: 'effortLevel' }))
        info.model = [effort ? `${label} with ${effort} effort` : label, plan].filter(Boolean).join(' · ')
      } finally {
        isDescribing = false
      }
    }
    await describeModel()

    if (now === 'pending') await update($, phase, () => (isFresh ? 'playing' : 'skipped'))
    // A reload mid-transformation lands on CyberClawd whole.
    if (now === 'playing' || now === 'done') skip()
    if (now === 'playing') await update($, phase, () => 'done')

    await $.command.register({
      name: 'cyber-clawd',
      description: "Gives CyberClawd a row under the logo (it runs by itself at startup)",
    })

    if ((await read($, phase)) !== 'skipped') {
      if (isFresh) {
        // No notice under the logo: the command's output row takes its place.
        $.clock.after(NOTICE_WAIT_MS, () => {
          if (notice === null && isFullscreen) void $.command.run({ command: 'cyber-clawd', args: '' })
        })
      }
      $.clock.every(TICK_MS, () => {
        tick += 1
        // `/model` and `/effort` change the line mid-session.
        if (tick % 25 === 0) void describeModel()
        if (tick === TRANSFORMED) void update($, phase, () => 'done')
        if (live.host !== null && live.isVisible) {
          void $.ui.blit({
            requestId: live.host.requestId,
            key: KEY,
            cells: encode(frame(tick, live.columns, info)),
          })
        }
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.props.isDraft || e.props.isWorking) skip()
    isFullscreen = e.surface === 'terminal' && e.viewport?.isFullscreen === true

    return next(e)
  })

  // A state's own message (shown in place of the word) is left as it is.
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: cyberWord(e.props.word) } }),
  )

  on('prompt.submit', ($, e, next) => {
    skip()

    return next(e)
  })

  on('command.run', { command: 'cyber-clawd' }, () => ({ text: 'CyberClawd online.' }))

  // The host row as the engine draws it, room kept under it for the rest of
  // the banner, and the banner over the logo above.
  const banner = ({ Box, Raster }: Elements['terminal'], row: RenderElement, kind: HostKind) => {
    const place = PLACES[kind]

    return (
      <Box flexDirection="column">
        {row}
        <Box height={ROWS + place.top - 1} />
        <Box position="absolute" top={place.top} left={place.left}>
          <Raster
            key={KEY}
            columns={live.columns}
            rows={ROWS}
            cells={encode(frame(tick, live.columns, info))}
          />
        </Box>
      </Box>
    )
  }

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    notice ??= e.requestId
    if (notice === e.requestId) {
      info.notice = e.props.command === null ? e.props.text : `${e.props.text} · ${e.props.command}`
    }

    if (e.surface !== 'terminal' || !(await claim($, e, 'notice', live))) return next(e)

    return banner($.ui.resolve(e), await next(e), 'notice')
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'cyber-clawd' } }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await claim($, e, 'command', live))) return next(e)

    return banner($.ui.resolve(e), await next(e), 'command')
  })
}

type Live = {
  // The row the banner is drawn from: the first notice drawn, else the
  // command's output.
  host: Host | null
  // Whether that row is in the transcript's viewport; no blits while not.
  isVisible: boolean
  // The mounted banner's width, which the blits must match.
  columns: number
}

// Whether this row is the banner's host: the first notice or command output
// drawn in the fullscreen layout once CyberClawd plays.
async function claim(
  $: EngineInterface,
  e: { requestId: string; viewport?: RenderViewport; props: { onScreen?: OnScreen | null } },
  kind: HostKind,
  live: Live,
): Promise<boolean> {
  const now = await read($, phase)
  if ((now !== 'playing' && now !== 'done') || e.viewport?.isFullscreen !== true) return false
  live.host ??= { kind, requestId: e.requestId }
  if (live.host.requestId !== e.requestId) return false
  live.isVisible = e.props.onScreen !== null
  // Full width, so none of the stock header shows past the banner.
  live.columns = Math.min(512, e.viewport.columns)

  return true
}

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

// The label a `modelPicker` setting gives the model, else its own name:
// `claude-opus-5-5` → `Opus 5.5`.
function pickerLabel(picker: unknown, model: string): string {
  const options = field(picker, 'options')
  const option = Array.isArray(options) ? options.find(o => field(o, 'model') === model) : undefined
  const label = stringOr(field(option, 'label'))
  if (label !== undefined) return label
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model)
  if (claude === null) return model
  const [, family, major, minor] = claude

  return `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

// A model's own effort setting, where it has one.
function effortFor(modelSettings: unknown, model: string): string | undefined {
  return stringOr(field(field(modelSettings, model), 'effortLevel'))
}

// `claude_pro` → `Claude Pro`.
function planName(config: unknown): string {
  const type = stringOr(field(field(config, 'oauthAccount'), 'organizationType')) ?? ''

  return type
    .split('_')
    .filter(Boolean)
    .map(word => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}
