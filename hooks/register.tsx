import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, OnScreen, Register, RenderViewport } from 'claude-code'

import type { IntroPhase } from '../types'
import type { HeaderInfo } from './banner'
import { frameRows, ROWS, TICK_MS, TRANSFORMED } from './banner'
import { cyberWord } from './spinner'

// No mod draws the startup logo, and since Claude Code 2.1.316 (2.1.309 let
// it) the transcript clamps a row's absolute drawing to the row's own top-left
// corner, so nothing a mod draws reaches the rows above it. CyberClawd boots
// in the row under the logo instead, in the same scrolling region, and
// scrolls with the logo from there. The host is a startup notice under the
// logo where Claude Code shows one (`▎ Using …`), else the output of
// `/cyber-clawd`, which the mod runs once at startup.
type HostKind = 'notice' | 'command'
type Host = { kind: HostKind; requestId: string }
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

    const isPlaying = (await read($, phase)) !== 'skipped'
    if (isPlaying) {
      $.clock.every(TICK_MS, () => {
        tick += 1
        // `/model` and `/effort` change the line mid-session.
        if (tick % 25 === 0) void describeModel()
        if (tick === TRANSFORMED) void update($, phase, () => 'done')
        if (live.host !== null && live.isVisible) {
          const { requestId } = live.host
          frameRows(tick, live.columns, info).forEach((cells, row) => {
            void $.ui.blit({ requestId, key: `${KEY}-${row}`, cells })
          })
        }
      })
    }

    const started = await next(e)
    if (isPlaying && isFresh) {
      // No notice under the logo: the command's output row takes its place.
      // The run starts before this hook returns: one started later, from a
      // timer, skips this plugin's own hooks, and core answers a command no
      // hook answered with an error.
      await $.clock.sleep(NOTICE_WAIT_MS)
      if (notice === null && isFullscreen) void $.command.run({ command: 'cyber-clawd', args: '' })
    }

    return started
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

  // The banner in the host row's place, ROWS one-row Rasters, so the row is
  // as tall as the banner, the conversation starts under it, and it scrolls
  // out a row at a time. The host's own text (the notice, or `CyberClawd
  // online.`) is not drawn; the readout says the notice again.
  //
  // A notice's tree starts on the notice's own row, so the rows go in the
  // flow. The command's tree starts under the `❯ /cyber-clawd` line the
  // engine draws, which is the row's first row: the rows are drawn absolute,
  // one row up, which the engine allows (the clamp is to the row's corner,
  // not the tree's), so the banner covers that line too.
  const banner = ({ Box, Raster }: Elements['terminal'], kind: HostKind) => {
    const rows = frameRows(tick, live.columns, info).map((cells, i) => (
      <Raster key={`${KEY}-${i}`} columns={live.columns} rows={1} cells={cells} />
    ))
    if (kind === 'notice') return <Box flexDirection="column">{rows}</Box>

    return (
      <Box flexDirection="column">
        <Box height={ROWS - 1} />
        {rows.map((raster, i) => (
          <Box position="absolute" top={i - 1} left={0}>
            {raster}
          </Box>
        ))}
      </Box>
    )
  }

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    notice ??= e.requestId
    if (notice === e.requestId) {
      info.notice = e.props.command === null ? e.props.text : `${e.props.text} · ${e.props.command}`
    }

    if (e.surface !== 'terminal' || !(await claim($, e, 'notice', live))) return next(e)
    await next(e)

    return banner($.ui.resolve(e), 'notice')
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'cyber-clawd' } }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await claim($, e, 'command', live))) return next(e)
    await next(e)

    return banner($.ui.resolve(e), 'command')
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
