import { type Request, type Response, type NextFunction } from "express";

function parseIpRanges(rangesEnv: string): string[] {
  return rangesEnv
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Normalise an address string.
 *
 * Express (with trust proxy) may surface IPv4-mapped IPv6 addresses
 * (e.g. "::ffff:10.0.0.1"). Strip the prefix so CIDR matching always
 * operates on a plain IPv4 quad string when the address is actually IPv4.
 * Pure IPv6 addresses are left unchanged; they will not match any IPv4 CIDR
 * and are therefore rejected by default, which is the safe choice.
 */
function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    const candidate = ip.slice(7);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) {
      return candidate;
    }
  }
  // Unwrap bracket notation for IPv6: [::1] -> ::1
  if (ip.startsWith("[") && ip.endsWith("]")) {
    return ip.slice(1, -1);
  }
  return ip;
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function isInCidr(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr ?? "32", 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  if (ipNum === null || rangeNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) >>> 0 === (rangeNum & mask) >>> 0;
}

function ipMatches(clientIp: string, range: string): boolean {
  if (range.includes("/")) return isInCidr(clientIp, range);
  return clientIp === range;
}

/**
 * Resolve the client IP to check against the allowlist.
 *
 * Security note: we prefer the raw TCP socket address to avoid spoofing via
 * a forged X-Forwarded-For header. `req.ip` is only used when
 * TRUSTED_PROXY=true is set, which should only be done when the deployment
 * is guaranteed to sit behind a trusted reverse proxy that sanitises the
 * forwarding headers (e.g., Replit's mTLS proxy in production).
 */
function getClientIp(req: Request): string {
  const trustProxy = process.env.TRUSTED_PROXY === "true";
  if (trustProxy) {
    return normalizeIp(req.ip ?? req.socket.remoteAddress ?? "");
  }
  return normalizeIp(req.socket.remoteAddress ?? "");
}

export function ipAllowlistMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const trustedRangesEnv = process.env.TRUSTED_IP_RANGES;

  // TRUSTED_IP_RANGES not set → allowlist is disabled (dev-safe default)
  if (!trustedRangesEnv) {
    next();
    return;
  }

  const ranges = parseIpRanges(trustedRangesEnv);
  if (ranges.length === 0) {
    next();
    return;
  }

  const clientIp = getClientIp(req);
  const isAllowed = ranges.some((cidr) => ipMatches(clientIp, cidr));

  if (!isAllowed) {
    res.status(403).json({ error: "Access denied: IP not in trusted range" });
    return;
  }

  next();
}
