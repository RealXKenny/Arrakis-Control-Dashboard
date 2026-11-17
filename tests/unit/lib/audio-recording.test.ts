import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, DEFAULT_AUDIO, LOCAL_DEALER_VOICE, parsePreferences } from '../../../src/lib/audio/manager';

afterEach(() => vi.unstubAllGlobals());
const clips = ['a', 'b'].map((letter) => `/api/assets/audio/casino/solaris-v1/${letter.repeat(24)}.mp3`);

function harness() {
  const sources: Array<{
    buffer: unknown;
    playbackRate: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const decode = vi.fn(async () => ({ duration: 1, length: 24000, numberOfChannels: 1 }));
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 10;
      destination = {};
      resume = async () => {};
      close = close;
      decodeAudioData = decode;
      createGain = () => gain;
      createBufferSource = () => {
        const source = {
          buffer: null,
          playbackRate: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        sources.push(source);
        return source;
      };
    },
  );
  const speak = vi.fn();
  vi.stubGlobal('window', { speechSynthesis: { speak, cancel: vi.fn(), getVoices: () => [] } });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  const fetcher = vi.fn(async () => new Response(new Uint8Array(16), { headers: { 'content-length': '16' } }));
  vi.stubGlobal('fetch', fetcher);
  const manager = new AudioManager();
  manager.configure({ ...DEFAULT_AUDIO, enabled: true });
  manager.unlock();
  return { manager, sources, gain, speak, fetcher, decode, close };
}

describe('local voice playback', () => {
  it('defaults and migrates the former device default to the locally hosted pack', () => {
    expect(DEFAULT_AUDIO.voiceURI).toBe(LOCAL_DEALER_VOICE);
    expect(parsePreferences({ voiceURI: '' }).voiceURI).toBe(LOCAL_DEALER_VOICE);
    expect(parsePreferences({ voiceURI: 'explicit-device-voice' }).voiceURI).toBe('explicit-device-voice');
  });
  it('decodes the complete utterance once, schedules continuous playback, and reuses the bounded cache', async () => {
    const { manager, sources, gain, speak, fetcher, decode, close } = harness();
    manager.announce({ id: 'first', text: 'Example.', priority: 2, clips });
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].start).toHaveBeenCalledWith(10.04);
    expect(sources[1].start).toHaveBeenCalledWith(11.04);
    expect(sources[0].playbackRate.value).toBe(1);
    expect(gain.gain.value).toBe(0.4);
    expect(speak).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(2);
    manager.configure({ ...DEFAULT_AUDIO, enabled: true, rate: 1.3 });
    expect(sources.every((source) => source.stop.mock.calls.length > 0)).toBe(true);
    manager.announce({ id: 'second', text: 'Example.', priority: 4, clips });
    await vi.waitFor(() => expect(sources).toHaveLength(4));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sources[2].playbackRate.value).toBeCloseTo(1.3 / 0.95);
    manager.dispose();
    expect(close).toHaveBeenCalled();
  });
  it('supports local narration even when browser speech synthesis is unavailable', async () => {
    const { manager, sources } = harness();
    vi.stubGlobal('window', {});
    manager.announce({ id: 'no-browser-voice', text: 'Example.', priority: 2, clips });
    await vi.waitFor(() => expect(sources).toHaveLength(2));
  });
  it('falls back once for a failed utterance, without starting a partial recording', async () => {
    const { manager, sources, fetcher, speak } = harness();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    manager.announce({ id: 'failed', text: 'Example.', priority: 4, clips });
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(sources).toHaveLength(0);
  });
  it('never plays stale clips or fallback speech when a cancelled request resolves late', async () => {
    const { manager, sources, speak, fetcher } = harness();
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    manager.announce({ id: 'cancelled', text: 'Example.', priority: 2, clips: [clips[0]] });
    manager.cancel();
    resolve(new Response(new Uint8Array(16)));
    await new Promise((done) => setTimeout(done, 0));
    expect(sources).toHaveLength(0);
    expect(speak).not.toHaveBeenCalled();
  });
  it('does not fetch recordings while disabled, before a gesture, or with muted voice volume', async () => {
    const { manager, fetcher } = harness();
    manager.configure(DEFAULT_AUDIO);
    manager.announce({ id: 'disabled', text: 'Example.', priority: 2, clips });
    manager.configure({ ...DEFAULT_AUDIO, enabled: true, volumes: { ...DEFAULT_AUDIO.volumes, voice: 0 } });
    manager.announce({ id: 'muted', text: 'Example.', priority: 2, clips });
    const fresh = new AudioManager();
    fresh.configure({ ...DEFAULT_AUDIO, enabled: true });
    fresh.announce({ id: 'locked', text: 'Example.', priority: 2, clips });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
