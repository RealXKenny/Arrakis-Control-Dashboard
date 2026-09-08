import { createServer } from 'node:net';

// Minimal RESP2 transport fixture shared by adapter tests and the runtime smoke.
// It validates wire encoding; it is not a Redis server or Lua interpreter.
export function createRedisFixture(reply) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const parsed = parse(buffer);
        if (!parsed) break;
        buffer = buffer.subarray(parsed.offset);
        try {
          const command = parsed.args;
          const result = ['CLIENT', 'AUTH', 'SELECT'].includes(command[0].toUpperCase()) ? 'OK' : reply(command);
          socket.write(serialize(result));
        } catch {
          socket.write('-ERR fixture command failed\r\n');
        }
      }
    });
  });
  return {
    server,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function parse(buffer) {
  const end = buffer.indexOf('\r\n');
  if (end < 0) return null;
  const count = Number(buffer.toString('utf8', 1, end));
  const args = [];
  let offset = end + 2;
  for (let index = 0; index < count; index++) {
    const lengthEnd = buffer.indexOf('\r\n', offset);
    if (lengthEnd < 0) return null;
    const length = Number(buffer.toString('utf8', offset + 1, lengthEnd));
    offset = lengthEnd + 2;
    if (buffer.length < offset + length + 2) return null;
    args.push(buffer.toString('utf8', offset, offset + length));
    offset += length + 2;
  }
  return { args, offset };
}

function serialize(value) {
  if (value === null) return '$-1\r\n';
  if (Array.isArray(value)) return `*${value.length}\r\n${value.map(serialize).join('')}`;
  if (typeof value === 'number') return `:${value}\r\n`;
  return `$${Buffer.byteLength(String(value))}\r\n${value}\r\n`;
}
