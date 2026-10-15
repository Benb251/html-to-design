// apps/figma-plugin/src/url-polyfill.ts
// WHATWG URL polyfill for Figma plugin main sandbox (jsvm-cpp / QuickJS).
// In Figma Desktop's jsvm-cpp environment, the WHATWG `URL` constructor is not
// present in global scope, which causes schema validators (e.g. Zod's z.string().url())
// to reject all URL-bearing fields with:
// "[capture.page.url] Invalid URL (invalid_format)".
//
// This self-contained polyfill installs globalThis.URL and URL.canParse if missing,
// containing 0 dynamic imports, 0 import.meta, and 0 external chunk loaders.

const URL_PATTERN =
  /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/((?:([^:@/]*)(?::([^@/]*))?@)?(\[[a-fA-F0-9:.]+\]|[^:/?#]*)(?::([0-9]*))?))?([^?#]*)(\?[^#]*)?(#.*)?$/;

export class URLPolyfill {
  public protocol: string;
  public username: string;
  public password: string;
  public hostname: string;
  public port: string;
  public host: string;
  public pathname: string;
  public search: string;
  public hash: string;
  public origin: string;
  public href: string;

  constructor(input: string | URLPolyfill, base?: string | URLPolyfill) {
    let resolved = String(input).trim();

    if (base !== undefined) {
      const baseObj = base instanceof URLPolyfill ? base : new URLPolyfill(base);
      if (resolved.startsWith("//")) {
        resolved = baseObj.protocol + resolved;
      } else if (resolved.startsWith("/")) {
        resolved = baseObj.origin + resolved;
      } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(resolved)) {
        const basePath = baseObj.pathname.endsWith("/")
          ? baseObj.pathname
          : baseObj.pathname.replace(/\/[^/]*$/, "/");
        resolved = baseObj.origin + basePath + resolved;
      }
    }

    const match = resolved.match(URL_PATTERN);
    if (!match) {
      throw new TypeError(`Invalid URL: ${String(input)}`);
    }

    const scheme = match[1]!.toLowerCase();
    this.protocol = `${scheme}:`;
    this.username = match[3] || "";
    this.password = match[4] || "";
    this.hostname = match[5] ? match[5].toLowerCase() : "";
    this.port = match[6] || "";
    this.host = this.port ? `${this.hostname}:${this.port}` : this.hostname;

    const isSpecial = ["http", "https", "ftp", "ws", "wss"].includes(scheme);
    if (isSpecial) {
      if (!match[2] || !this.hostname) {
        throw new TypeError(`Invalid URL: missing host for scheme '${scheme}' in '${resolved}'`);
      }
      this.pathname = match[7] ? (match[7].startsWith("/") ? match[7] : `/${match[7]}`) : "/";
      this.origin = `${this.protocol}//${this.host}`;
    } else {
      this.pathname = match[7] || "";
      this.origin = "null";
    }

    this.search = match[8] || "";
    this.hash = match[9] || "";

    let auth = "";
    if (this.username || this.password) {
      auth = `${this.username}${this.password ? `:${this.password}` : ""}@`;
    }
    const authority = match[2] !== undefined ? `//${auth}${this.host}` : "";
    this.href = `${this.protocol}${authority}${this.pathname}${this.search}${this.hash}`;
  }

  public toString(): string {
    return this.href;
  }

  public toJSON(): string {
    return this.href;
  }

  public static canParse(url: string | URLPolyfill, base?: string | URLPolyfill): boolean {
    try {
      new URLPolyfill(url, base);
      return true;
    } catch {
      return false;
    }
  }

  public static parse(url: string | URLPolyfill, base?: string | URLPolyfill): URLPolyfill | null {
    try {
      return new URLPolyfill(url, base);
    } catch {
      return null;
    }
  }
}

export function installUrlPolyfill(): void {
  const g = globalThis as unknown as { URL?: typeof URLPolyfill };
  if (typeof g.URL === "undefined") {
    g.URL = URLPolyfill;
  } else if (typeof (g.URL as { canParse?: unknown }).canParse !== "function") {
    (g.URL as { canParse: (url: string, base?: string) => boolean }).canParse = (
      url: string,
      base?: string,
    ): boolean => {
      try {
        new (g.URL as typeof URLPolyfill)(url, base);
        return true;
      } catch {
        return false;
      }
    };
  }
}

// Auto-install on module evaluation
installUrlPolyfill();
