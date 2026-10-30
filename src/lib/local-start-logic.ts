// Keep command parsing independent of the child processes so an explicit
// port cannot silently leave ngrok forwarding to a different server.
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

export function ngrokPublicUrl(line: string): string | null {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (record?.msg !== "started tunnel" || typeof record.url !== "string") return null;
  try {
    const url = new URL(record.url);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
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
