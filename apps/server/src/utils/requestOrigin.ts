import type { FastifyRequest } from "fastify";

export function requestOrigin(request: FastifyRequest, fallbackOrigin: string): string {
  const protocol = firstHeaderValue(request.headers["x-forwarded-proto"]) ?? request.protocol ?? "https";
  const host = externalHost(request, protocol);
  if (!host) {
    return stripTrailingSlashes(fallbackOrigin);
  }

  return `${protocol}://${host}`;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end--;
  }
  return value.slice(0, end);
}

function externalHost(request: FastifyRequest, protocol: string): string | undefined {
  const host = firstHeaderValue(request.headers["x-forwarded-host"]) ?? firstHeaderValue(request.headers.host);
  const forwardedPort = firstHeaderValue(request.headers["x-forwarded-port"]);
  if (!host || !forwardedPort || hasPort(host) || isDefaultPort(protocol, forwardedPort)) {
    return host;
  }

  return `${host}:${forwardedPort}`;
}

function hasPort(host: string): boolean {
  if (host.startsWith("[")) {
    return host.includes("]:");
  }

  return host.includes(":");
}

function isDefaultPort(protocol: string, port: string): boolean {
  return (protocol === "http" && port === "80") || (protocol === "https" && port === "443");
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || undefined;
}
