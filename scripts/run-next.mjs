import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { createInterface } from "node:readline";
import { stripVTControlCharacters } from "node:util";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const [command, ...forwardedArgs] = process.argv.slice(2);

if (command !== "dev" && command !== "start") {
  console.error("Usage: node scripts/run-next.mjs <dev|start> [next options]");
  process.exit(1);
}

const hasOption = (names) => forwardedArgs.some((argument) => names.includes(argument) || names.some((name) => argument.startsWith(`${name}=`)));
const hostname = process.env.DASHBOARD_HOSTNAME ?? "127.0.0.1";
const port = process.env.DASHBOARD_PORT ?? "2008";
const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const nextArgs = [command];

if (!hasOption(["--hostname", "-H"])) {
  nextArgs.push("--hostname", hostname);
}

if (!hasOption(["--port", "-p"])) {
  nextArgs.push("--port", port);
}

nextArgs.push(...forwardedArgs);

const cleanConsole = command === "start" && process.env.DASHBOARD_CLEAN_CONSOLE !== "false";

if (cleanConsole) {
  // Panel output is piped, so console.clear() would do nothing. Clear the
  // terminal viewport and scrollback explicitly before application logs start.
  process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
}

const child = spawn(process.execPath, [nextCli, ...nextArgs], {
  stdio: cleanConsole ? ["inherit", "pipe", "inherit"] : "inherit",
  env: process.env,
});

if (cleanConsole) {
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", (line) => {
    const plain = stripVTControlCharacters(line).trim();
    // Match only Next's informational startup lines; stderr stays untouched.
    if (/^▲ Next\.js \d/.test(plain)
      || /^- (Local|Network):\s+https?:\/\//.test(plain)
      || /^✓ Ready in \d/.test(plain)
      || /^✓ Running next\.config\.[a-z]+ took \d/.test(plain)) {
      return;
    }
    process.stdout.write(`${line}\n`);
  });
}

child.on("close", (exitCode, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(exitCode ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
