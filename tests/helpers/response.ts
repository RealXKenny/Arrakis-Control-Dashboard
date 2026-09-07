export function responseMock() {
  const headers = new Map<string, unknown>();
  return {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    setHeader(name: string, value: unknown) { headers.set(name, value); },
    getHeader(name: string) { return headers.get(name); },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
}
