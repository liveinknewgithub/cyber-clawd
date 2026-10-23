// Cyberpunk words for the spinner. Pure: nothing here touches `$`.

const WORDS = [
  'Jacking in',
  'Decrypting',
  'Netrunning',
  'Breaching ICE',
  'Bypassing ICE',
  'Burning chrome',
  'Spoofing packets',
  'Overclocking',
  'Rerouting the grid',
  'Splicing code',
  'Ghosting the firewall',
  'Cracking the cipher',
  'Riding the datastream',
  'Syncing neural link',
  'Booting the deck',
  'Tracing the signal',
  'Patching cyberware',
  'Rewiring synapses',
  'Scanning the net',
  'Uploading consciousness',
  'Compiling wetware',
  'Slicing the mainframe',
  'Forging credentials',
  'Defragging the matrix',
]

// The word the engine sampled for this turn picks ours, so it holds for the
// turn and changes with the next.
export function cyberWord(word: string): string {
  let hash = 0x811c9dc5
  for (const ch of word) hash = Math.imul(hash ^ ch.codePointAt(0)!, 0x01000193)

  return WORDS[(hash >>> 0) % WORDS.length]!
}
