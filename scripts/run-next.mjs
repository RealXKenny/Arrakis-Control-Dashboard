import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

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

const child = spawn(process.execPath, [nextCli, ...nextArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (exitCode, signal) => {
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
