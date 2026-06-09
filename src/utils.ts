import { invoke } from "@tauri-apps/api/core";
import type { MemePost, RedditPost } from "./types";

export const fmt = (n: number): string => {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

export function relTime(utc: number): string {
  const s = Date.now() / 1000 - utc;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function parsePost(raw: RedditPost): MemePost | null {
  if (raw.is_video && raw.media?.reddit_video?.fallback_url) {
    const rv = raw.media.reddit_video;
    const bg = raw.preview?.images?.[0]?.source?.url ?? "";

    return {
      id: raw.id,
      sub: raw.subreddit,
      title: raw.title,
      author: `u/${raw.author}`,
      up: raw.ups,
      type: "video",
      media: rv.fallback_url,
      bg,
      audioUrl:
        !rv.is_gif && rv.has_audio !== false && rv.hls_url
          ? rv.hls_url
          : undefined,
      t: relTime(raw.created_utc),
    };
  }
  if (raw.post_hint === "image") {
    const url = raw.url_overridden_by_dest;
    const bg = raw.preview?.images?.[0]?.source?.url ?? url;
    return {
      id: raw.id,
      sub: raw.subreddit,
      title: raw.title,
      author: `u/${raw.author}`,
      up: raw.ups,
      type: url.toLowerCase().endsWith(".gif") ? "gif" : "image",
      media: url,
      bg,
      t: relTime(raw.created_utc),
    };
  }
  return null;
}

/**
 * Calls the Rust backend to fetch a subreddit via bun, passing the full
 * headers object the user extracted from their browser's DevTools.
 */
export async function fetchSubreddit(
  sub: string,
  headersJson: string,
  after = "",
): Promise<{ posts: MemePost[]; after: string | null }> {
  const text = await invoke<string>("fetch_reddit", {
    subreddit: sub,
    headersJson,
    after,
  });
  let json: {
    data: { children: Array<{ data: RedditPost }>; after: string | null };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${sub}: Reddit returned non-JSON`);
  }
  return {
    posts: json.data.children
      .map((c) => parsePost(c.data))
      .filter((p): p is MemePost => p !== null),
    after: json.data.after ?? null,
  };
}

export function interleave(arrays: MemePost[][]): MemePost[] {
  const out: MemePost[] = [];
  const maxLen = Math.max(0, ...arrays.map((a) => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) out.push(arr[i]);
    }
  }
  return out;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Parse the headers object from a "Copy as fetch" or "Copy as cURL (bash)"
 * paste.  Returns null if no cookie header is found.
 */
export function parseHeadersFromPaste(
  text: string,
): Record<string, string> | null {
  const t = text.trim();

  const hi = t.indexOf('"headers"');
  if (hi !== -1) {
    const braceStart = t.indexOf("{", hi);
    if (braceStart !== -1) {
      let depth = 0,
        end = braceStart;
      for (let i = braceStart; i < t.length; i++) {
        if (t[i] === "{") depth++;
        else if (t[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      try {
        const obj = JSON.parse(t.slice(braceStart, end + 1)) as Record<
          string,
          string
        >;
        if (obj.cookie) return obj;
      } catch {
        /* fall through */
      }
    }
  }

  const headers: Record<string, string> = {};
  const re = /-H\s+(?:'([^']+)'|"([^"]+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const raw = m[1] ?? m[2];
    const ci = raw.indexOf(":");
    if (ci === -1) continue;
    headers[raw.slice(0, ci).trim().toLowerCase()] = raw.slice(ci + 1).trim();
  }
  // Parse -b / --cookie flag (used by macOS Chrome's "Copy as cURL")
  const cookieFlag = /-b\s+(?:'([^']*)'|"([^"]*)")/;
  const cm = t.match(cookieFlag);
  if (cm && !headers.cookie) {
    headers.cookie = cm[1] ?? cm[2];
  }
  if (headers.cookie) return headers;

  return null;
}
