// A minimal Discord Activity RPC client: handshake, READY and AUTHORIZE over postMessage.
// It mirrors the Embedded App SDK 2.5.0 protocol without depending on it (the SDK pulls in a vulnerable zod 3).

export const RPC_PROTOCOL_VERSION = 1;
/** The SDK release whose message protocol this mirrors; Discord uses it to pick compatible behavior. */
export const COMPATIBLE_SDK_VERSION = '2.5.0';
const MOBILE_SDK_VERSION_MINIMUM = 250;

enum Opcode {
  Handshake = 0,
  Frame = 1,
  Close = 2,
  Hello = 3,
}

/** Origins the Discord client may message the Activity from (the SDK's own list, minus local development). */
const DISCORD_ORIGINS = [
  'https://discord.com',
  'https://discordapp.com',
  'https://ptb.discord.com',
  'https://ptb.discordapp.com',
  'https://canary.discord.com',
  'https://canary.discordapp.com',
  'https://staging.discord.co',
  'https://pax.discord.com',
  'null',
];

export interface LaunchParams {
  readonly frameId: string;
  readonly instanceId: string;
  readonly platform: 'desktop' | 'mobile';
  readonly mobileAppVersion: string | null;
}

export interface MessageChannel {
  /** Sends a message to the Discord client frame. */
  post(message: unknown): void;
  /** Subscribes to incoming messages; returns an unsubscribe function. */
  listen(handler: (origin: string, data: unknown) => void): () => void;
  readonly ownOrigin: string;
}

export class ActivityClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function readLaunchParams(search: string): LaunchParams | null {
  const params = new URLSearchParams(search);
  const frameId = params.get('frame_id');
  const instanceId = params.get('instance_id');
  const platform = params.get('platform');
  if (!frameId || !instanceId || (platform !== 'desktop' && platform !== 'mobile')) return null;
  return { frameId, instanceId, platform, mobileAppVersion: params.get('mobile_app_version') };
}

function mobileMajor(version: string | null): number {
  const major = version?.includes('.') ? Number.parseInt(version.split('.')[0] ?? '', 10) : Number.NaN;
  return Number.isFinite(major) ? major : -1;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

type Pending = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class DiscordActivityClient {
  private readonly pending = new Map<string, Pending>();
  private readonly allowed: Set<string>;
  private readyResolve: (() => void) | null = null;
  private readonly readyPromise: Promise<void>;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly clientId: string,
    readonly launch: LaunchParams,
    private readonly channel: MessageChannel,
    private readonly newNonce: () => string = () => crypto.randomUUID(),
  ) {
    this.allowed = new Set([...DISCORD_ORIGINS, channel.ownOrigin]);
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.unsubscribe = channel.listen((origin, data) => this.receive(origin, data));
    const handshake: Record<string, unknown> = {
      v: RPC_PROTOCOL_VERSION,
      encoding: 'json',
      client_id: clientId,
      frame_id: launch.frameId,
    };
    if (launch.platform === 'desktop' || mobileMajor(launch.mobileAppVersion) >= MOBILE_SDK_VERSION_MINIMUM) {
      handshake.sdk_version = COMPATIBLE_SDK_VERSION;
    }
    channel.post([Opcode.Handshake, handshake]);
  }

  ready(timeoutMs = 15_000): Promise<void> {
    return Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new ActivityClientError('Discord did not respond.', 'READY_TIMEOUT')), timeoutMs),
      ),
    ]);
  }

  /** Asks Discord for an OAuth code; the first time, Discord shows the member a consent prompt. */
  async authorize(scope: readonly string[], timeoutMs = 5 * 60_000): Promise<string> {
    const data = await this.command(
      'AUTHORIZE',
      { client_id: this.clientId, response_type: 'code', state: '', scope },
      timeoutMs,
    );
    const code = isRecord(data) ? data.code : undefined;
    if (typeof code !== 'string' || !code || code.length > 512) {
      throw new ActivityClientError('Discord returned an invalid sign-in response.', 'INVALID_RESPONSE');
    }
    return code;
  }

  close(): void {
    this.unsubscribe();
    for (const [nonce, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new ActivityClientError('The Activity closed.', 'CLOSED'));
      this.pending.delete(nonce);
    }
  }

  private command(cmd: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const nonce = this.newNonce();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new ActivityClientError('Discord did not answer in time.', 'COMMAND_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(nonce, { resolve, reject, timer });
      this.channel.post([Opcode.Frame, { cmd, args, nonce }]);
    });
  }

  private receive(origin: string, data: unknown): void {
    // Dev note: postMessage is an open door, so we check the stillsuit badge before letting anyone in.
    if (!this.allowed.has(origin) || !Array.isArray(data)) return;
    const [opcode, payload] = data as [unknown, unknown];
    if (opcode !== Opcode.Frame || !isRecord(payload)) return;
    if (payload.cmd === 'DISPATCH') {
      if (payload.evt === 'READY') this.readyResolve?.();
      return;
    }
    if (typeof payload.nonce !== 'string') return;
    const pending = this.pending.get(payload.nonce);
    if (!pending) return;
    this.pending.delete(payload.nonce);
    clearTimeout(pending.timer);
    if (payload.evt === 'ERROR') {
      const detail = isRecord(payload.data) && typeof payload.data.message === 'string' ? payload.data.message : '';
      pending.reject(new ActivityClientError(detail.slice(0, 200) || 'Discord refused the request.', 'DISCORD_ERROR'));
      return;
    }
    pending.resolve(payload.data);
  }
}

/** The real browser channel: the Discord client is the parent (or the opener of a popped-out Activity). */
export function browserChannel(): MessageChannel {
  const target = window.parent.opener ?? window.parent;
  const targetOrigin = document.referrer ? new URL(document.referrer).origin : '*';
  return {
    ownOrigin: window.location.origin,
    post: (message) => (target as Window).postMessage(message, targetOrigin),
    listen: (handler) => {
      const listener = (event: MessageEvent) => handler(event.origin, event.data);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
  };
}
