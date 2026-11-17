import { spawn } from 'node:child_process';

/** One bridge child per launcher, with bounded restarts; never starts from a browser request. */
export function superviseChatBridge({
  env = process.env,
  spawnWorker = () =>
    spawn(process.execPath, ['--import', 'tsx', 'src/features/chat/server/worker.ts'], {
      env,
      stdio: 'inherit',
    }),
  warn = (message) => console.warn(message),
  random = Math.random,
} = {}) {
  let child;
  let restartTimer;
  let stopped = false;
  let delay = 1_000;
  let startedAt = 0;
  const launch = () => {
    if (stopped || child) return;
    startedAt = Date.now();
    let current;
    const ended = () => {
      if (child !== current || stopped) return;
      child = undefined;
      if (Date.now() - startedAt > 60_000) delay = 1_000;
      const wait = delay + Math.floor(random() * 500);
      delay = Math.min(delay * 2, 30_000);
      warn('Chat Bridge exited; restarting automatically with bounded backoff.');
      restartTimer = setTimeout(() => {
        restartTimer = undefined;
        launch();
      }, wait);
    };
    try {
      current = spawnWorker();
      child = current;
      // Do not print raw spawn errors: they may contain environment or command details.
      current.once('error', ended);
      current.once('exit', ended);
    } catch {
      child = current;
      ended();
    }
  };
  launch();
  let shutdown;
  return {
    stop(signal = 'SIGTERM') {
      if (shutdown) return shutdown;
      stopped = true;
      clearTimeout(restartTimer);
      const current = child;
      child = undefined;
      shutdown = !current
        ? Promise.resolve()
        : new Promise((resolve) => {
            const timer = setTimeout(() => {
              current.kill('SIGKILL');
              resolve();
            }, 15_000);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            current.once('exit', done);
            current.once('error', done);
            current.kill(signal);
          });
      return shutdown;
    },
  };
}
