import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Offline authoring only. Deployments serve the committed MP3s and never load this model.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const toolsRoot = path.resolve(root, process.argv[2] ?? '.next/cache/casino-voice-tools');
const output = path.join(root, 'src/assets/audio/casino/solaris-v1');
const modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const voice = 'af_heart';
const speed = 0.95;
const sha = (data) => createHash('sha256').update(data).digest('hex');
const script = new Map();
const add = (text, spoken = text) => script.set(text.toLowerCase(), spoken);
const small = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const number = (n) => (n < 20 ? small[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${small[n % 10]}` : ''}`);
const ranks = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
const article = (word) => (['ace', 'eight'].includes(word) ? 'an' : 'a');

for (const text of [
  'Welcome to the Emperor’s Hand.',
  'Place your bets.',
  'Bets are closed.',
  'Dealing the cards.',
  'Another card.',
  'Double down.',
  'Splitting the pair.',
  'You stand.',
  'You have',
  'and',
  'point',
  'times.',
  'hundred',
  'thousand',
  'million',
  'billion',
  'trillion',
  'Bust.',
  'Dealer busts.',
  'Blackjack. Congratulations.',
  'You win.',
  'Dealer wins.',
  'Hand lost.',
  'Push. Your wager is returned.',
  'Hand settled.',
  'Round cancelled. Your wager was returned.',
  'Bets settled.',
  'No win.',
  'House Scarab prevails.',
  'House Crescent prevails.',
  'Your prediction was correct.',
  'The other House wins.',
  'Sandworm detected. Expedition lost.',
  'Harvest secured. Cash-out confirmed.',
  'Spice discovered.',
  'The harvest begins.',
  'Storm contact. Flight terminated.',
  'Cash-out confirmed at',
  'Flight initiated.',
])
  add(text);
add('Hand 1', 'Hand one.');
add('Hand 2', 'Hand two.');
for (let n = 0; n < 100; n++) add(String(n), `${number(n)}.`);
for (const rank of ranks) {
  add(rank, `${rank}.`);
  add(`Dealer shows a ${rank}`, `Dealer shows ${article(rank)} ${rank}.`);
  add(`Dealer shows an ${rank}`, `Dealer shows ${article(rank)} ${rank}.`);
  for (const second of ranks)
    add(`You have ${rank} and ${second}`, `You have ${article(rank)} ${rank} and ${article(second)} ${second}.`);
}
for (let n = 0; n <= 31; n++) add(`Dealer has ${n}`, `Dealer has ${number(n)}.`);
for (let n = 12; n <= 21; n++) add(`Soft ${n}`, `Soft ${number(n)}.`);
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
for (let n = 0; n <= 36; n++)
  add(
    `${n}, ${n === 0 ? 'green' : red.has(n) ? 'red' : 'black'}. Bets settled.`,
    `${number(n)}, ${n === 0 ? 'green' : red.has(n) ? 'red' : 'black'}. Bets settled.`,
  );

await mkdir(output, { recursive: true });
await mkdir(path.join(toolsRoot, 'models'), { recursive: true });
const { KokoroTTS } = await import(pathToFileURL(path.join(toolsRoot, 'node_modules/kokoro-js/dist/kokoro.js')));
const { StyleTextToSpeech2Model, AutoTokenizer, env, RawAudio } = await import(
  pathToFileURL(path.join(toolsRoot, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs'))
);
env.cacheDir = path.join(toolsRoot, 'models');
const [model, tokenizer] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(modelId, {
    revision,
    dtype: 'q8',
    device: 'cpu',
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  }),
  AutoTokenizer.from_pretrained(modelId, { revision }),
]);
const tts = new KokoroTTS(model, tokenizer);
const ffmpeg =
  process.platform === 'win32' ? path.join(toolsRoot, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe') : 'ffmpeg';
const manifest = {
  version: 'solaris-v1',
  voice,
  model: modelId,
  revision,
  license: 'Apache-2.0',
  speed,
  sampleRate: 24000,
  bitrate: 48000,
  clips: {},
};
const wav = path.join(toolsRoot, 'working.wav');
let completed = 0;
console.log(`Generating ${script.size} locally hosted dealer phrases with ${voice}.`);
for (const [text, spoken] of script) {
  const file = `${sha(`solaris-v1:${voice}:${speed}:${spoken}`).slice(0, 24)}.mp3`;
  const target = path.join(output, file);
  if ((await stat(target).catch(() => null))?.size < 1024 || !(await stat(target).catch(() => null))) {
    const audio = await tts.generate(spoken, { voice, speed });
    const samples = audio.audio;
    // Trim only the outside silence; keep the model's internal pauses and inflection.
    let first = 0,
      last = samples.length - 1;
    while (first < last && Math.abs(samples[first]) < 0.002) first++;
    while (last > first && Math.abs(samples[last]) < 0.002) last--;
    first = Math.max(0, first - 240);
    last = Math.min(samples.length, last + 720);
    await new RawAudio(samples.slice(first, last), 24000).save(wav);
    const result = spawnSync(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wav,
        '-af',
        'loudnorm=I=-19:TP=-2:LRA=7,aresample=24000,afade=t=in:st=0:d=0.005,apad=pad_len=960',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '48k',
        '-map_metadata',
        '-1',
        target,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.status !== 0) throw new Error(`Audio encoding failed: ${result.stderr || result.error?.message}`);
  }
  const bytes = await readFile(target);
  manifest.clips[text] = { file, spoken, bytes: bytes.length, sha256: sha(bytes) };
  completed++;
  if (completed % 20 === 0 || completed === script.size) console.log(`${completed}/${script.size} phrases ready`);
}
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await model.dispose();
console.log(`Voice pack ready: ${new Set(Object.values(manifest.clips).map((clip) => clip.file)).size} unique MP3s.`);
