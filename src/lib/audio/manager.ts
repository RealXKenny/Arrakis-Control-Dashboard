export const AUDIO_KEY = 'arrakis-audio-v1';
export const LOCAL_DEALER_VOICE = 'local:solaris-v1';
export const CATEGORIES = ['ui', 'casino', 'voice', 'ambient'] as const;
export type Category = (typeof CATEGORIES)[number];
export type AudioPreferences = {
  enabled: boolean;
  hover: boolean;
  captions: boolean;
  master: number;
  voiceURI: string;
  rate: number;
  volumes: Record<Category, number>;
};
export const DEFAULT_AUDIO: AudioPreferences = {
  enabled: false,
  hover: false,
  captions: true,
  master: 0.5,
  voiceURI: LOCAL_DEALER_VOICE,
  rate: 0.95,
  volumes: { ui: 0.35, casino: 0.6, voice: 0.8, ambient: 0 },
};
export function parsePreferences(raw: unknown): AudioPreferences {
  const p = raw && typeof raw === 'object' ? (raw as Partial<AudioPreferences>) : {};
  const volume = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  return {
    enabled: p.enabled === true,
    hover: p.hover === true,
    captions: p.captions !== false,
    master: volume(p.master, 0.5),
    voiceURI: typeof p.voiceURI === 'string' && p.voiceURI ? p.voiceURI.slice(0, 300) : LOCAL_DEALER_VOICE,
    rate: typeof p.rate === 'number' && Number.isFinite(p.rate) ? Math.max(0.7, Math.min(1.3, p.rate)) : 0.95,
    volumes: Object.fromEntries(CATEGORIES.map((c) => [c, volume(p.volumes?.[c], DEFAULT_AUDIO.volumes[c])])) as Record<
      Category,
      number
    >,
  };
}

/** Original synthesized sound palette. No downloads, third-party recordings or preload cost. */
export const SOUND_REGISTRY = {
  click: [420, 0.045],
  navigation: [660, 0.09],
  menu: [520, 0.06],
  hover: [800, 0.025],
  chip: [1250, 0.055],
  deal: [190, 0.07],
  win: [880, 0.26],
  loss: [145, 0.18],
  reveal: [560, 0.12],
  warning: [240, 0.16],
  wheel: [390, 1.3],
  dice: [230, 0.35],
  coin: [1760, 0.8],
  sand: [120, 0.22],
  flight: [90, 0.4],
} as const;
export type Sound = keyof typeof SOUND_REGISTRY;
export type Announcement = {
  id: string;
  text: string;
  priority: number;
  sound?: Sound;
  persona?: string;
  clips?: readonly string[];
};

export class AudioManager {
  preferences = DEFAULT_AUDIO;
  private context: AudioContext | null = null;
  private unlocked = false;
  private lastSound = 0;
  private seen = new Set<string>();
  private queue: Announcement[] = [];
  private speaking = false;
  private priority = 0;
  private generation = 0;
  private nodes = new Set<AudioScheduledSourceNode>();
  private recordings = new Map<string, string>();
  private recordingRequest: AbortController | null = null;
  private voiceSources = new Set<AudioBufferSourceNode>();
  private decoded = new Map<string, AudioBuffer>();
  private decodedBytes = 0;
  private ambience: OscillatorNode[] = [];
  private scene = false;
  onCaption: (text: string) => void = () => {};
  /** Optional licensed recordings imported by the bundler; no provider or external origin is permitted. */
  registerRecording(phrase: string, bundledUrl: string) {
    if (!/^\/_next\/static\/media\/[a-zA-Z0-9_.-]+\.(mp3|wav|ogg|m4a)$/.test(bundledUrl)) return false;
    this.recordings.set(phrase, bundledUrl);
    return true;
  }
  configure(preferences: AudioPreferences) {
    this.preferences = preferences;
    this.cancel();
  }
  unlock() {
    this.unlocked = true;
    if (!this.preferences.enabled || typeof window === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      this.startAmbience();
    } catch {
      /* captions and play remain available */
    }
  }
  setScene(enabled: boolean) {
    this.scene = enabled;
    if (enabled) this.startAmbience();
    else this.stopAmbience();
  }
  private startAmbience() {
    if (
      !this.scene ||
      this.ambience.length ||
      !this.unlocked ||
      !this.context ||
      !this.preferences.enabled ||
      !this.preferences.volumes.ambient ||
      !this.preferences.master
    )
      return;
    try {
      for (const frequency of [55, 82.41]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = this.preferences.master * this.preferences.volumes.ambient * 0.025;
        oscillator.connect(gain).connect(this.context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start();
        this.ambience.push(oscillator);
      }
    } catch {
      this.stopAmbience();
    }
  }
  private stopAmbience() {
    for (const oscillator of this.ambience) {
      try {
        oscillator.stop();
      } catch {
        /* already stopped */
      }
    }
    this.ambience = [];
  }
  play(sound: Sound, category: Category = 'ui') {
    const p = this.preferences;
    if (
      !this.unlocked ||
      !p.enabled ||
      !p.master ||
      !p.volumes[category] ||
      !this.context ||
      Date.now() - this.lastSound < 65
    )
      return;
    this.lastSound = Date.now();
    try {
      const [frequency, duration] = SOUND_REGISTRY[sound];
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = sound === 'chip' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.6, this.context.currentTime + duration);
      gain.gain.setValueAtTime(Math.max(0.0001, p.master * p.volumes[category] * 0.12), this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain).connect(this.context.destination);
      this.nodes.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.nodes.delete(oscillator);
      };
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
      if (['deal', 'wheel', 'dice', 'sand', 'flight'].includes(sound)) {
        const buffer = this.context.createBuffer(
          1,
          Math.ceil(this.context.sampleRate * duration),
          this.context.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = sound === 'deal' ? 2400 : 650;
        const noiseGain = this.context.createGain();
        noiseGain.gain.value = p.master * p.volumes[category] * 0.15;
        source.connect(filter).connect(noiseGain).connect(this.context.destination);
        this.nodes.add(source);
        source.onended = () => {
          source.disconnect();
          filter.disconnect();
          noiseGain.disconnect();
          this.nodes.delete(source);
        };
        source.start();
      }
    } catch {
      /* Audio must never interrupt an action. */
    }
  }
  announce(event: Announcement) {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.onCaption(this.preferences.captions ? event.text : '');
    if (event.sound) this.play(event.sound, 'casino');
    if (
      !this.unlocked ||
      !this.preferences.enabled ||
      !this.preferences.master ||
      !this.preferences.volumes.voice ||
      typeof window === 'undefined' ||
      (!('speechSynthesis' in window) && !this.recordings.has(event.text) && !event.clips?.length)
    )
      return;
    if (event.priority >= this.priority) this.cancelSpeech();
    this.queue.push(event);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.queue = this.queue.slice(0, 3);
    this.drain();
  }
  private drain() {
    if (this.speaking || !this.queue.length) return;
    const event = this.queue.shift()!;
    const generation = this.generation;
    const local = this.preferences.voiceURI === LOCAL_DEALER_VOICE;
    const registered = this.recordings.get(event.text);
    const clips = local && event.clips?.length ? event.clips : registered ? [registered] : [];
    if (clips.length && this.context) {
      this.speaking = true;
      this.priority = event.priority;
      void this.playClips(event, clips, generation, local);
      return;
    }
    this.speak(event, generation);
  }
  private async playClips(event: Announcement, clips: readonly string[], generation: number, local: boolean) {
    const context = this.context!;
    const controller = new AbortController();
    this.recordingRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      if (
        clips.length > 96 ||
        clips.some(
          (clip) =>
            !/^\/api\/assets\/audio\/casino\/solaris-v1\/[a-f0-9]{24}\.mp3$/.test(clip) &&
            !/^\/_next\/static\/media\/[a-zA-Z0-9_.-]+\.(mp3|wav|ogg|m4a)$/.test(clip),
        )
      )
        throw new Error('Unknown voice clip');
      const buffers = new Map<string, AudioBuffer>();
      const unique = [...new Set(clips)];
      let utteranceBytes = 0;
      // Four fetches at a time, with no more than one utterance loading in this manager.
      for (let at = 0; at < unique.length; at += 4) {
        await Promise.all(
          unique.slice(at, at + 4).map(async (clip) => {
            let buffer = this.decoded.get(clip);
            if (buffer) {
              this.decoded.delete(clip);
              this.decoded.set(clip, buffer);
            } else {
              const response = await fetch(clip, {
                credentials: 'same-origin',
                signal: controller.signal,
                redirect: 'error',
              });
              if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 2_000_000)
                throw new Error('Recording unavailable');
              const reader = response.body?.getReader();
              if (!reader) throw new Error('Recording unavailable');
              const chunks: Uint8Array[] = [];
              let length = 0;
              try {
                for (;;) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  length += chunk.value.byteLength;
                  if (length > 2_000_000) throw new Error('Recording too large');
                  chunks.push(chunk.value);
                }
              } finally {
                await reader.cancel();
                reader.releaseLock();
              }
              const data = new Uint8Array(length);
              let offset = 0;
              for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
              }
              buffer = await context.decodeAudioData(data.buffer);
              if (buffer.duration > 30 || controller.signal.aborted || generation !== this.generation)
                throw new Error('Obsolete recording');
              const bytes = buffer.length * buffer.numberOfChannels * 4;
              if (bytes <= 12_000_000) {
                this.decoded.set(clip, buffer);
                this.decodedBytes += bytes;
                while (this.decoded.size > 128 || this.decodedBytes > 12_000_000) {
                  const oldest = this.decoded.keys().next().value!;
                  const expired = this.decoded.get(oldest)!;
                  this.decodedBytes -= expired.length * expired.numberOfChannels * 4;
                  this.decoded.delete(oldest);
                }
              }
            }
            utteranceBytes += buffer.length * buffer.numberOfChannels * 4;
            if (utteranceBytes > 16_000_000) throw new Error('Voice utterance too large');
            buffers.set(clip, buffer);
          }),
        );
      }
      if (controller.signal.aborted || generation !== this.generation) return;
      // Resolve the complete utterance before starting: a failed clip never leaves half a sentence playing.
      const gain = context.createGain();
      gain.gain.value = this.preferences.master * this.preferences.volumes.voice;
      gain.connect(context.destination);
      const rate = this.preferences.rate / (local ? 0.95 : 1);
      let when = context.currentTime + 0.04;
      let remaining = clips.length;
      for (const clip of clips) {
        const source = context.createBufferSource();
        source.buffer = buffers.get(clip)!;
        source.playbackRate.value = rate;
        source.connect(gain);
        this.nodes.add(source);
        this.voiceSources.add(source);
        source.onended = () => {
          source.disconnect();
          this.nodes.delete(source);
          this.voiceSources.delete(source);
          if (--remaining === 0) {
            gain.disconnect();
            if (generation === this.generation) {
              this.speaking = false;
              this.priority = 0;
              this.drain();
            }
          }
        };
        source.start(when);
        when += source.buffer.duration / rate;
      }
    } catch {
      controller.abort();
      if (generation !== this.generation) return;
      // Fall back once for the whole announcement, preserving captions and gameplay if decoding is unsupported.
      this.speaking = false;
      this.speak(event, generation);
    } finally {
      clearTimeout(timeout);
      if (this.recordingRequest === controller) this.recordingRequest = null;
    }
  }
  private speak(event: Announcement, generation: number) {
    try {
      const speech = new SpeechSynthesisUtterance(event.text);
      speech.voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === this.preferences.voiceURI) ?? null;
      speech.volume = this.preferences.master * this.preferences.volumes.voice;
      speech.rate = this.preferences.rate;
      speech.pitch = event.persona === 'ornithopter-run' ? 0.85 : event.persona === 'spice-harvest' ? 1.05 : 0.95;
      speech.onend = speech.onerror = () => {
        if (generation !== this.generation) return;
        this.speaking = false;
        this.priority = 0;
        this.drain();
      };
      this.speaking = true;
      this.priority = event.priority;
      window.speechSynthesis.speak(speech);
    } catch {
      this.speaking = false;
    }
  }
  private cancelSpeech() {
    this.generation++;
    this.recordingRequest?.abort();
    this.recordingRequest = null;
    for (const source of this.voiceSources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.voiceSources.clear();
    this.queue = [];
    this.speaking = false;
    this.priority = 0;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  cancel() {
    this.cancelSpeech();
    this.stopAmbience();
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.onCaption('');
  }
  dispose() {
    this.cancel();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.decoded.clear();
    this.decodedBytes = 0;
    this.unlocked = false;
  }
}
export const audio = new AudioManager();
