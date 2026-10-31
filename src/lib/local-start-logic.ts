// Keep command parsing independent of the child processes so an explicit
// port cannot silently leave the tunnel forwarding to a different server.
export function localStartOptions(args: string[], envPort?: string) {
  let port = envPort || "3005";
  const nextArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-p" || arg === "--port") {
      port = args[++index] ?? "";
    } else if (arg.startsWith("--port=")) {
      port = arg.slice("--port=".length);
    } else {
      nextArgs.push(arg);
    }
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Use a port between 1 and 65535 with --port or PORT.");
  }
  return { port: Number(port), nextArgs };
}

// The Cloudflare tunnel `start:lan` and `dev:lan` run, and the public
// address its DNS route points at. It must be a named tunnel: a quick
// tunnel (trycloudflare.com) does not carry Server-Sent Events, and the
// table's live updates are an event stream, so phones would join and then
// hear nothing. Create one once (docs/install.md) and set CLOUDFLARE_TUNNEL
// and CLOUDFLARE_TUNNEL_URL, or fill in the defaults below for this fork.
export const DEFAULT_CLOUDFLARE_TUNNEL = "";
export const DEFAULT_CLOUDFLARE_TUNNEL_URL = "";

export function cloudflareTunnel(envTunnel?: string, envUrl?: string): { tunnel: string; url: string } {
  const tunnel = (envTunnel ?? DEFAULT_CLOUDFLARE_TUNNEL).trim();
  const value = (envUrl ?? DEFAULT_CLOUDFLARE_TUNNEL_URL).trim();
  if (!tunnel || !value) {
    throw new Error("Set CLOUDFLARE_TUNNEL to your named tunnel and CLOUDFLARE_TUNNEL_URL to its public address (see docs/install.md).");
  }
  // A name or UUID only: anything else would be read by cloudflared as a flag.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tunnel)) {
    throw new Error("Set CLOUDFLARE_TUNNEL to the tunnel's name or UUID, as `cloudflared tunnel list` shows it.");
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Set CLOUDFLARE_TUNNEL_URL to the tunnel's hostname, like https://couch.example.com.");
  }
  return { tunnel, url: url.origin };
}

// cloudflared logs JSON to stderr with `--output json`. Its first registered
// edge connection is when the public address starts answering.
export function cloudflaredLogRecord(line: string): { level: string; message: string } | null {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof record?.level !== "string" || typeof record.message !== "string") return null;
  return { level: record.level, message: record.message };
}

export function cloudflaredConnected(line: string): boolean {
  return cloudflaredLogRecord(line)?.message.startsWith("Registered tunnel connection") ?? false;
}

export function localServerEnv(env: NodeJS.ProcessEnv, publicUrl: string) {
  return {
    ...env,
    ODM_TUNNEL_PUBLIC_URL: publicUrl,
  };
}

export function localDevOrigins(configuredOrigins?: string, tunnelPublicUrl?: string) {
  return [
    ...(configuredOrigins || "").split(","),
    ...(tunnelPublicUrl ? [new URL(tunnelPublicUrl).hostname] : []),
  ].map((origin) => origin.trim()).filter(Boolean);
}
