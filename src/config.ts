// Loopback only: the server fronts a live API key, and the spec is single
// user on localhost. Binding 0.0.0.0 would let anyone on the network spend it.
const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

export function serverConfig(env: NodeJS.ProcessEnv = process.env): { host: string; port: number } {
  const parsed = Number(env.PORT);
  const port = Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
  return { host: HOST, port };
}
