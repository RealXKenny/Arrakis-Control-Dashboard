import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { superviseChatBridge } from '../../../scripts/chat-bridge-supervisor.mjs';

afterEach(() => vi.useRealTimers());
function child() {
  const current = Object.assign(new EventEmitter(), { kill: vi.fn((..._args: unknown[]) => true) });
  return current;
}

describe('automatic Chat Bridge supervision', () => {
  it('starts without requests, restarts one child with bounded backoff and cancels restarts on stop', async () => {
    vi.useFakeTimers();
    const first = child();
    const second = child();
    const spawnWorker = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
    const supervisor = superviseChatBridge({ spawnWorker, warn: vi.fn(), random: () => 0 });
    expect(spawnWorker).toHaveBeenCalledOnce();
    first.emit('exit', 1);
    first.emit('error', new Error('sensitive spawn failure'));
    await vi.advanceTimersByTimeAsync(999);
    expect(spawnWorker).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(spawnWorker).toHaveBeenCalledTimes(2);
    const stopped = supervisor.stop('SIGTERM');
    expect(second.kill).toHaveBeenCalledWith('SIGTERM');
    second.emit('exit', 0);
    await stopped;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawnWorker).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds shutdown and never restarts a child being stopped', async () => {
    vi.useFakeTimers();
    const current = child();
    const supervisor = superviseChatBridge({ spawnWorker: () => current, warn: vi.fn() });
    const pending = supervisor.stop();
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(current.kill).toHaveBeenLastCalledWith('SIGKILL');
    expect(supervisor.stop()).toBe(pending);
  });
  it('recovers from synchronous spawn failures without logging their raw errors', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const spawnWorker = vi.fn().mockImplementation(() => {
      throw new Error('secret-value');
    });
    const supervisor = superviseChatBridge({ spawnWorker, warn, random: () => 0 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnWorker).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-value');
    await supervisor.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
