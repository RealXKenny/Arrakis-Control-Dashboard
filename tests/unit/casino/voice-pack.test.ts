import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../../src/assets/audio/casino/solaris-v1/manifest.json';
import { casinoVoiceClips } from '../../../src/features/casino/audio/voice-pack';
import { narrateRound } from '../../../src/features/casino/components/narration';
import type { RoundView } from '../../../src/features/casino/contracts';

describe('locally hosted dealer voice pack', () => {
  it('ships nonempty compressed audio matching the manifest checksums', () => {
    const files = new Map(Object.values(manifest.clips).map((clip) => [clip.file, clip]));
    expect(files.size).toBeGreaterThan(300);
    let total = 0;
    for (const [file, clip] of files) {
      expect(file).toMatch(/^[a-f0-9]{24}\.mp3$/);
      const bytes = readFileSync(path.resolve('src/assets/audio/casino/solaris-v1', file));
      expect(bytes.length).toBe(clip.bytes);
      expect(bytes.length).toBeGreaterThan(1000);
      expect(bytes.length).toBeLessThan(100000);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
      total += bytes.length;
    }
    expect(total).toBeLessThan(6_000_000);
    expect(manifest).toMatchObject({
      voice: 'af_heart',
      license: 'Apache-2.0',
      revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
    });
  });

  it.each([
    'Another card. You have ace and six and king. 17. Dealer shows a ten.',
    'Double down. You have king and queen. 20. Dealer has 24. Dealer busts. You win.',
    'Splitting the pair. Hand 1 eight and ten. 18. Hand 2 eight and seven. 15. Dealer shows a six.',
    'You stand. You have ace and six. Soft 17. Dealer has 17. Push. Your wager is returned.',
    'Round cancelled. Your wager was returned.',
    'House Scarab prevails. Your prediction was correct.',
    'House Crescent prevails. The other House wins.',
    'The harvest begins.',
    'Spice discovered.',
    'Harvest secured. Cash-out confirmed.',
    'Sandworm detected. Expedition lost.',
    'Flight initiated.',
    'Storm contact. Flight terminated.',
    'Cash-out confirmed at 1234.50 times.',
    'Cash-out confirmed at 1000000.01 times.',
  ])('covers the complete announcement: %s', (text) => {
    const clips = casinoVoiceClips(text);
    expect(clips).not.toBeNull();
    expect(clips!.every((clip) => /^\/api\/assets\/audio\/casino\/solaris-v1\/[a-f0-9]{24}\.mp3$/.test(clip))).toBe(
      true,
    );
  });

  it('covers every possible Dice decimal and all Roulette results without synthesizing in the browser', () => {
    for (let n = 0; n < 10000; n++)
      expect(casinoVoiceClips(`${(n / 100).toFixed(2)}. ${n % 2 ? 'You win.' : 'No win.'}`)).not.toBeNull();
    for (let n = 0; n <= 36; n++) {
      const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
      expect(casinoVoiceClips(`${n}, ${n === 0 ? 'green' : red.has(n) ? 'red' : 'black'}. Bets settled.`)).toHaveLength(
        1,
      );
    }
  });

  it('preserves both decimal digits and avoids a full two-card sentence inside a longer hand', () => {
    const paths = casinoVoiceClips('42.60. You win.')!;
    const filenames = paths.map((value) => value.split('/').at(-1));
    expect(filenames.slice(0, 4)).toEqual(
      ['42', 'point', '6', '0'].map((key) => manifest.clips[key as keyof typeof manifest.clips].file),
    );
    const longer = casinoVoiceClips('You have ace and six and king. 17.')!;
    expect(longer[0]).toContain(manifest.clips['you have'].file);
    expect(casinoVoiceClips('Unrecognized announcement.')).toBeNull();
  });

  it('attaches recordings to actual public-view narration and keeps the hidden dealer card private', () => {
    const round: RoundView = {
      id: 'voice-round',
      game: 'emperors-hand',
      status: 'open',
      wager: '100',
      holds: 1,
      version: 1,
      fairness: null,
      game_view: {
        hands: [{ cards: [0, 5], total: 17, soft: true }],
        dealer: [9],
        dealerHidden: true,
        dealerTotal: null,
      },
      settlement: null,
      failureCode: null,
    };
    const event = narrateRound(round, null)!;
    expect(event.text).toContain('Dealer shows a ten');
    expect(event.clips?.length).toBeGreaterThan(0);
    expect(event.clips).toEqual(casinoVoiceClips(event.text));
  });
});
