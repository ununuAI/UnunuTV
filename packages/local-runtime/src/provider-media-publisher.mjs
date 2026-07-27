import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UnuTvError, createId, nowIso } from "@ununu/unutv-contracts";

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function signingSecret(dataRoot, explicitSecret) {
  if (explicitSecret) return explicitSecret;
  const directory = path.join(dataRoot, "runtime");
  const filePath = path.join(directory, "provider-media.secret");
  mkdirSync(directory, { recursive: true });
  if (!existsSync(filePath)) writeFileSync(filePath, `${randomBytes(32).toString("hex")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return readFileSync(filePath, "utf8").trim();
}

function publicBaseUrlFile(dataRoot) {
  return path.join(dataRoot, "runtime", "provider-media-base-url");
}

function storedPublicBaseUrl(dataRoot) {
  const filePath = publicBaseUrlFile(dataRoot);
  return existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : "";
}

function signature(secret, pathname, expires) {
  return createHmac("sha256", secret).update(`${pathname}\n${expires}`).digest("hex");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export class ProviderMediaPublisher {
  constructor(dataRoot, projects, media, options = {}) {
    this.projects = projects;
    this.media = media;
    this.dataRoot = dataRoot;
    this.publicBaseUrl = options.publicBaseUrl || process.env.UNUTV_PUBLIC_MEDIA_BASE_URL || storedPublicBaseUrl(dataRoot);
    this.secret = signingSecret(dataRoot, options.signingSecret || process.env.UNUTV_PUBLIC_MEDIA_SIGNING_SECRET);
  }

  configuredBaseUrl() {
    let url;
    try { url = new URL(this.publicBaseUrl); }
    catch { throw new UnuTvError("public_tunnel_not_configured", "Set UNUTV_PUBLIC_MEDIA_BASE_URL to the current public HTTPS tunnel URL", 409); }
    if (url.protocol !== "https:" || isLoopback(url.hostname)) {
      throw new UnuTvError("public_tunnel_invalid", "Public media base URL must be a non-loopback HTTPS tunnel URL", 409);
    }
    return url.toString().replace(/\/$/, "");
  }

  setPublicBaseUrl(value) {
    this.publicBaseUrl = value || "";
    if (this.publicBaseUrl) {
      const filePath = publicBaseUrlFile(this.dataRoot);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${this.publicBaseUrl}\n`, { encoding: "utf8", mode: 0o600 });
    }
    return this.publicBaseUrl;
  }

  publish(input) {
    const media = this.media.open(input.projectId, input.mediaId);
    if (!media) throw new UnuTvError("media_not_found", `Media not found: ${input.mediaId}`, 404);
    const baseUrl = this.configuredBaseUrl();
    const duration = Math.min(Math.max(Math.round(input.expiresInSeconds), 60), 604800);
    const expires = Math.floor(Date.now() / 1000) + duration;
    const pathname = `/provider-media/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.mediaId)}`;
    const remoteUrl = new URL(pathname, `${baseUrl}/`);
    remoteUrl.searchParams.set("expires", String(expires));
    remoteUrl.searchParams.set("signature", signature(this.secret, pathname, expires));
    const publication = {
      id: createId("publication"),
      mediaId: input.mediaId,
      provider: input.provider,
      remoteUrl: remoteUrl.toString(),
      status: "ready",
      expiresAt: new Date(expires * 1000).toISOString(),
      createdAt: nowIso()
    };
    return this.projects.recordMediaPublication(input.projectId, publication);
  }

  openSigned(input) {
    const expires = Number(input.expires);
    if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
      throw new UnuTvError("provider_media_expired", "Provider media URL is missing or expired", 403);
    }
    const pathname = `/provider-media/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.mediaId)}`;
    const expected = signature(this.secret, pathname, expires);
    if (!safeEqual(input.signature, expected)) throw new UnuTvError("provider_media_signature_invalid", "Provider media signature is invalid", 403);
    const media = this.media.open(input.projectId, input.mediaId);
    if (!media) throw new UnuTvError("media_not_found", `Media not found: ${input.mediaId}`, 404);
    return media;
  }
}
