import { describe, expect, it } from 'vitest';
import { parseDiscordRelay } from '../../../src/features/chat/discord-relay';

const bot = 'Relay Bot#1234';
describe('identity-verified Discord relay detection', () => {
  it.each([
    ['[Discord] Kenny: Test', 'Kenny', 'Test'],
    ['[Discord] [Owner] Kenny: Test', 'Kenny', 'Test'],
    ['[Discord] Shai 🪱: One: two\n<img src=x>', 'Shai 🪱', 'One: two\n<img src=x>'],
  ])('extracts the reference bot format %s', (text, senderName, content) => {
    expect(parseDiscordRelay(bot, text, bot)).toEqual({ senderName, content });
  });
  it.each([
    [undefined, '[Discord] Kenny: Test', bot],
    ['Player#9876', '[Discord] [Owner] Kenny: Test', bot],
    ['relay bot#1234', '[Discord] Kenny: Test', bot],
    [bot, '[Discord] Kenny: Test', undefined],
    [bot, 'Hello from the game', bot],
    [bot, '[discord] Kenny: Test', bot],
    [bot, '[Discord] Kenny', bot],
    [bot, '[Discord] : Test', bot],
    [bot, '[Discord] Kenny:   ', bot],
    [bot, '[Discord] Ken\nny: Test', bot],
    [bot, '[Discord] Ken\u0000ny: Test', bot],
  ])('refuses unverified identities or malformed relay formats', (sender, text, configured) => {
    expect(parseDiscordRelay(sender, text!, configured)).toBeNull();
  });
});
