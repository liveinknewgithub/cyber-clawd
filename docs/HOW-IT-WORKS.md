# How CyberClawd works

CyberClawd is a Claude Code **mod**: a plugin whose `hooks/hooks.json` names a TypeScript module that Claude Code loads and calls. The module hooks events (`session.start`, `prompt.submit`, `ui.render` on a component, …) and reaches Claude Code through `$`. The whole mod is three source files:

| File | What it holds |
|---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | The hooks: when to play, where to draw, the animation timer, the model line |
| [`hooks/banner.ts`](../hooks/banner.ts) | The art and animation, as pure functions from a tick to terminal cells |
| [`hooks/spinner.ts`](../hooks/spinner.ts) | The cyberpunk spinner words |

## The problem: mods can't draw the logo

Claude Code lets a mod redraw a fixed set of components: messages, tool rows, the spinner, the hint line under the prompt, the band above it, panes and a few more. The startup logo is not one of them, and there is no setting to hide it. So CyberClawd paints *over* it.

A `ui.render` hook can return a tree with a `Box` drawn `position: "absolute"` at negative offsets, which paints over the rows above it without moving them. That only works within one region of the screen, though: a drawing attached to the prompt area is clipped at the prompt area's top edge and never reaches the logo. It has to hang off a row in the **transcript**, the same scrolling region the logo is in.

## The host row

At startup the transcript holds just the logo, and Claude Code raises a hookable row under it in only one case: a startup notice such as *Using … (from settings.json)*, the `InfoNotice` component. So:

1. If an `InfoNotice` is drawn under the logo, it hosts the banner. Nothing else happens.
2. If none shows up within 600 ms of `session.start`, the mod runs its own `/cyber-clawd` command with `$.command.run`. The command's output row is a `CommandOutput`, which the mod can draw, and it lands right under the logo.

The host's hook returns three things in one tree:

```tsx
<Box flexDirection="column">
  {row}                                  {/* the row as Claude Code drew it */}
  <Box height={ROWS + place.top - 1} />  {/* room for the rest of the banner */}
  <Box position="absolute" top={place.top} left={place.left}>
    <Raster key="cyber-clawd" columns={columns} rows={9} cells={...} />
  </Box>
</Box>
```

`place` is where the logo's blank top row is relative to the host: 5 rows up for a notice, 7 for the command output (its own command line sits between). The empty `Box` makes the host row taller, so the 9-row banner never covers the conversation below it. Because the banner hangs off a transcript row, it scrolls away with the logo.

## Drawing and animating

The banner is one `Raster`: a grid of cells, each a character with a foreground and a background color, packed as base64 little-endian `u32` triplets. Clawd is pixel art drawn with `▀`, two pixels per cell (top in the foreground color, bottom in the background).

[`banner.ts`](../hooks/banner.ts) is pure: `frame(tick, columns, info)` returns the cells for one moment. A `$.clock.every(80, …)` timer advances the tick and calls `$.ui.blit`, which repaints the mounted `Raster` in place without re-running any hook. While the host row is scrolled out of view (its `onScreen` is `null`), the timer skips the blits.

The timeline:

| Ticks (80 ms each) | What shows |
|---|---|
| 0–4 | Static |
| 5–13 | A cyan scan line draws the banner in, one row a tick |
| 14 on | CyberClawd idles: visor glint, blinks, data pulse, rain, floor light, and a glitch every ~3.4 s |

A keystroke (the hint line's `isDraft`) or a submitted prompt jumps straight to tick 14.

## When it plays

`session.start` checks `$.session.messages()`. Only an empty conversation, a fresh start, plays. A resume skips it, since the logo may not be where the banner expects it, and so does a reload of the mod mid-session. The phase (`pending`, `playing`, `done`, `skipped`) lives in `$.state`, which outlives a reload, under the contract in [`types/index.d.ts`](../types/index.d.ts).

The banner only draws when the render's viewport says `isFullscreen`. The default layout prints the transcript into the terminal's scrollback, where nothing can be painted over afterwards.

## The readout

The banner covers the stock header, so it says the same things again:

- **Build:** `$.session.version()`.
- **Model line:** `$.session.model()`, named by a `modelPicker` setting's label when there is one (else `claude-opus-5-5` becomes `Opus 5.5`), then `with <effort> effort` from `modelSettings.<model>.effortLevel` or `effortLevel`, then `· <plan>` from `oauthAccount.organizationType` in Claude Code's own `.claude.json` (in `$CLAUDE_CONFIG_DIR`, else your home folder). It's re-read every 2 seconds, so `/model` changes show up.
- **Folder:** the session's working folder, with your home folder shortened to `~`.
- **Notice:** the startup notice's text, when a notice hosts the banner.

## The spinner

A `ui.render` hook on `Spinner` passes Claude Code's own drawing a different `word`. The word is picked by hashing the word Claude Code sampled for the turn, so it holds for a whole turn and changes with the next. A status message Claude Code shows in place of the word is left alone.

## Customizing

Clone the repository and run your copy with `claude --plugin-dir ./cyber-clawd`, or add its folder to `CLAUDE_CODE_PLUGIN_DIRS` in your settings' `env` block. In an interactive session, saving a file reloads the mod.

- **Colors:** the constants at the top of `banner.ts`. Colors are `0xRRGGBB`.
- **Sprite:** `SPRITE` in `banner.ts`, 24 columns by 18 rows of pixels. The legend is in the comment above it. Keep 18 rows (9 terminal rows) unless you also change `ROWS`.
- **Readout:** `textPanel()` returns one array of colored text runs per row, starting at column 30.
- **Spinner words:** `WORDS` in `spinner.ts`.
- **Timing:** `TICK_MS` (frame length), `BOOT` (static ticks) and the `tick % 43` glitch timer, all in `banner.ts`.
- **Notice wait:** `NOTICE_WAIT_MS` in `register.tsx`, if your startup notice is slow to appear and the command runs anyway.

After a change, run `claude plugin validate .` and `claude plugin test .`.

## Tests

[`tests/intro.test.tsx`](../tests/intro.test.tsx) runs under `claude plugin test`, against Claude Code's own engine with everything beneath the mod stubbed. It covers:

- The banner draws, and a keystroke skips to the finished banner without removing it.
- It outlasts the intro.
- With no notice, `/cyber-clawd` runs and its output hosts the banner.
- With a notice, no command runs.
- A resumed session gets no intro and runs no command.
- The model line reads like the stock header's.
- The spinner word is cyberpunk and holds for the turn.
