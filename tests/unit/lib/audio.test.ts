import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, DEFAULT_AUDIO, parsePreferences } from '../../../src/lib/audio/manager';

afterEach(() => vi.unstubAllGlobals());
describe('audio consent, preference validation and speech lifecycle', () => {
  it('accepts bundled licensed clips while rejecting remote or arbitrary provider URLs', () => {
    const manager = new AudioManager();
    expect(manager.registerRecording('Place your bets.', '/_next/static/media/place-bets.abc123.mp3')).toBe(true);
    for (const url of [
      'https://provider.test/voice.mp3',
      '//provider.test/voice.wav',
      '/api/private-token',
      '/_next/static/media/../secret.wav',
    ])
      expect(manager.registerRecording('Test', url)).toBe(false);
  });
  it('defaults to silence and clamps corrupt persisted preferences', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_AUDIO);
    expect(parsePreferences({ enabled: 'yes', master: 8, rate: Infinity, volumes: { voice: -1 } })).toMatchObject({
      enabled: false,
      master: 1,
      rate: 0.95,
      volumes: { voice: 0 },
    });
  });
  it('never speaks before a gesture, while muted, or when the category volume is zero', () => {
    const speak = vi.fn();
    vi.stubGlobal('window', { speechSynthesis: { speak, cancel: vi.fn(), getVoices: () => [] } });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    const manager = new AudioManager();
    manager.configure({ ...DEFAULT_AUDIO, enabled: true });
    manager.announce({ id: '1', text: 'Test', priority: 2 });
    expect(speak).not.toHaveBeenCalled();
    manager.unlock();
    manager.configure({ ...DEFAULT_AUDIO });
    manager.announce({ id: '2', text: 'Test', priority: 2 });
    expect(speak).not.toHaveBeenCalled();
    manager.configure({ ...DEFAULT_AUDIO, enabled: true, volumes: { ...DEFAULT_AUDIO.volumes, voice: 0 } });
    manager.announce({ id: '3', text: 'Test', priority: 2 });
    expect(speak).not.toHaveBeenCalled();
  });
  it('deduplicates events, prioritizes results, applies volume and selected voice, and cancels obsolete speech', () => {
    const speak = vi.fn(),
      cancel = vi.fn();
    const voice = { voiceURI: 'local-refined' };
    vi.stubGlobal('window', { speechSynthesis: { speak, cancel, getVoices: () => [voice] } });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    const manager = new AudioManager();
    manager.configure({ ...DEFAULT_AUDIO, enabled: true, voiceURI: 'local-refined' });
    manager.unlock();
    const event = { id: '1', text: 'Dealer shows a six.', priority: 2 };
    manager.announce(event);
    manager.announce(event);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toMatchObject({ voice, volume: 0.4, rate: 0.95 });
    manager.announce({ id: '2', text: 'Place your bets.', priority: 1 });
    expect(speak).toHaveBeenCalledTimes(1);
    manager.announce({ id: '3', text: 'You win.', priority: 4 });
    expect(speak).toHaveBeenCalledTimes(2);
    speak.mock.calls[0][0].onend(); // obsolete completion cannot revive the old queue
    expect(speak).toHaveBeenCalledTimes(2);
    manager.cancel();
    expect(cancel).toHaveBeenCalled();
  });
  it('keeps captions available when audio APIs are unsupported', () => {
    vi.stubGlobal('window', {});
    const manager = new AudioManager();
    manager.unlock();
    manager.onCaption = vi.fn();
    expect(() => manager.announce({ id: '1', text: 'Harvest secured.', priority: 4 })).not.toThrow();
    expect(manager.onCaption).toHaveBeenCalledWith('Harvest secured.');
  });
});
