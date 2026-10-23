// pending: not decided yet; playing: the transformation runs; done: CyberClawd
// stays on the logo; skipped: a resumed conversation, painted over nothing.
export type IntroPhase = 'pending' | 'playing' | 'done' | 'skipped'

declare module 'claude-code' {
  interface PluginState {
    'cyber-clawd': { phase: Shaped<IntroPhase> }
  }
}
