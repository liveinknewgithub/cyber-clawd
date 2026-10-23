import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const VIEWPORT = { columns: 120, rows: 40, isFullscreen: true }

const NOTICE = {
  plugin: 'cyber-clawd',
  surface: 'terminal',
  component: 'InfoNotice',
  requestId: 'notice',
  viewport: VIEWPORT,
  props: { text: 'Using Opus 5.5 (from settings.json)', command: '/model' },
} as const

const COMMAND = {
  plugin: 'cyber-clawd',
  surface: 'terminal',
  component: 'CommandOutput',
  requestId: 'command-output',
  viewport: VIEWPORT,
  props: { command: 'cyber-clawd', args: '', text: 'CyberClawd online.', isErrored: false },
} as const

const HINT = {
  plugin: 'cyber-clawd',
  surface: 'terminal',
  component: 'PromptHint',
  requestId: 'hint',
  viewport: VIEWPORT,
  props: { isDraft: true, isWorking: false, hint: '? for shortcuts' },
} as const

const SETTINGS: Record<string, unknown> = {
  effortLevel: 'high',
  modelSettings: { 'claude-haiku-5-5': { effortLevel: 'low' } },
}

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(on: On, messages: SessionMessage[], commands: string[] = []) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('ui.blit', () => ({ value: {} }))
  on('session.messages', () => ({ value: messages }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.version', () => ({ value: { version: '2.1.309', base: '2.1.309', builtAt: '' } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  // A read of one key is the read of the whole object, projected.
  on('settings.read', () => ({ value: SETTINGS }))
  on('env.get', () => ({ value: '/home/someone' }))
  on('fs.read', () => ({ value: JSON.stringify({ oauthAccount: { organizationType: 'claude_pro' } }) }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', (_, e) => {
    commands.push(e.command)

    return { text: '' }
  })
}

function textOf(cells: string): string {
  const bytes = (Uint8Array as unknown as { fromBase64(text: string): Uint8Array }).fromBase64(cells)
  const words = new Uint32Array(bytes.buffer)

  return Array.from({ length: words.length / 3 }, (_, i) => String.fromCodePoint(words[i * 3]!)).join('')
}

test('a keystroke skips the transformation, and CyberClawd stays', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const notice = await $.ui.mount(NOTICE)
  expect((await notice.find({ type: 'Raster', key: 'cyber-clawd' }))?.props).toMatchObject({
    columns: 120,
    rows: 9,
  })
  expect((await notice.find({ type: 'Text' }))?.text).toBe('engine')

  const hint = await $.ui.mount(HINT)
  await clock.advance(100)
  expect(await notice.find({ type: 'Raster', key: 'cyber-clawd' })).toBeDefined()
  await hint.unmount()
  await notice.unmount()
})

test('CyberClawd outlasts the intro', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const notice = await $.ui.mount(NOTICE)
  await clock.advance(60_000)
  expect(await notice.find({ type: 'Raster', key: 'cyber-clawd' })).toBeDefined()
  await notice.unmount()
})

test('with no notice under the logo, /cyber-clawd runs and hosts the banner', async ($, on) => {
  const clock = mock.clock(on)
  const commands: string[] = []
  engine(on, [], commands)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, props: { ...HINT.props, isDraft: false } })

  await clock.advance(1000)
  expect(commands).toEqual(['cyber-clawd'])

  const output = await $.ui.mount(COMMAND)
  expect(await output.find({ type: 'Raster', key: 'cyber-clawd' })).toBeDefined()
  await output.unmount()
  await hint.unmount()
})

test('a notice under the logo hosts it, and no command runs', async ($, on) => {
  const clock = mock.clock(on)
  const commands: string[] = []
  engine(on, [], commands)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, props: { ...HINT.props, isDraft: false } })
  const notice = await $.ui.mount(NOTICE)

  await clock.advance(1000)
  expect(commands).toEqual([])
  await notice.unmount()
  await hint.unmount()
})

test('a resumed conversation gets no intro and runs no command', async ($, on) => {
  const clock = mock.clock(on)
  const commands: string[] = []
  engine(on, [{ role: 'user', text: 'hello', toolUses: [] }], commands)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const notice = await $.ui.mount(NOTICE)
  expect(await notice.find({ type: 'Raster' })).toBeUndefined()
  await clock.advance(1000)
  expect(commands).toEqual([])
  await notice.unmount()
})

test('the banner carries the stock header\'s model line', async ($, on) => {
  mock.clock(on)
  engine(on, [])
  await $.session.start({ cwd: '/home/someone/code', surface: 'terminal', isInteractive: true })
  // A keystroke skips the static, so the banner is whole.
  const hint = await $.ui.mount(HINT)
  await hint.unmount()

  const notice = await $.ui.mount(NOTICE)
  const text = textOf((await notice.find({ type: 'Raster' }))?.props.cells as string)
  expect(text).toContain('Opus 5.5 with high effort · Claude Pro')
  expect(text).toContain('~/code')
  await notice.unmount()
})

test('the spinner says something cyberpunk, the same all turn', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.component === 'Spinner' ? e.props.word : 'engine'}</Text>
  })
  const spinner = {
    plugin: 'cyber-clawd',
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
  } as const

  for (const surface of ['terminal', 'desktop'] as const) {
    const first = await $.ui.mount({ ...spinner, surface })
    const word = (await first.find({ type: 'Text' }))?.text
    expect(word).not.toBe('Sauteing')
    await first.unmount()

    const again = await $.ui.mount({
      ...spinner,
      surface,
      props: { ...spinner.props, mode: 'tool-use' },
    })
    expect((await again.find({ type: 'Text' }))?.text).toBe(word)
    await again.unmount()
  }
})
