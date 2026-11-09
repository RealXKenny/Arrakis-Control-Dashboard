import manifest from '../../../assets/audio/casino/solaris-v1/manifest.json';

const tokens = (text: string) => text.toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+(?:'[a-z]+)?/g) ?? [];
const entries = Object.entries(manifest.clips)
  .map(([text, clip]) => ({ tokens: tokens(text), file: clip.file }))
  .sort((a, b) => b.tokens.length - a.tokens.length);
const byText = new Map(Object.entries(manifest.clips).map(([text, clip]) => [text, clip.file]));
const url = (file: string) => `/api/assets/audio/casino/solaris-v1/${file}`;

function integerParts(value: bigint): string[] {
  if (value < 100n) return [value.toString()];
  for (const [scale, name] of [
    [1000000000000n, 'trillion'],
    [1000000000n, 'billion'],
    [1000000n, 'million'],
    [1000n, 'thousand'],
    [100n, 'hundred'],
  ] as const) {
    if (value >= scale)
      return [...integerParts(value / scale), name, ...(value % scale ? integerParts(value % scale) : [])];
  }
  return [];
}

/** A finite local vocabulary covers every current dealer announcement, including exact decimal digits. */
export function casinoVoiceClips(text: string): string[] | null {
  const words = tokens(text);
  if (!words.length || words.length > 256) return null;
  const files: string[] = [];
  let at = 0;
  while (at < words.length) {
    const match = entries.find(
      (entry) =>
        entry.tokens.every((word, i) => words[at + i] === word) &&
        // A full two-card sentence would put a false stop before the third card.
        !(entry.tokens[0] === 'you' && entry.tokens.length > 2 && words[at + entry.tokens.length] === 'and'),
    );
    if (match) {
      files.push(match.file);
      at += match.tokens.length;
      continue;
    }
    const numeric = words[at].match(/^(\d{1,15})(?:\.(\d{1,4}))?$/);
    if (!numeric) return null;
    const pieces = [...integerParts(BigInt(numeric[1])), ...(numeric[2] ? ['point', ...numeric[2]] : [])];
    for (const piece of pieces) {
      const file = byText.get(piece);
      if (!file) return null;
      files.push(file);
    }
    at++;
  }
  return files.length <= 96 ? files.map(url) : null;
}
