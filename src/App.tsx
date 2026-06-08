import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

/* ─── Types ──────────────────────────────────────────────────── */

interface RedditVideo {
  fallback_url: string;
  hls_url?: string;
  is_gif: boolean;
  has_audio?: boolean;
}

interface RedditPost {
  id: string;
  title: string;
  author: string;
  ups: number;
  subreddit: string;
  url_overridden_by_dest: string;
  post_hint?: string;
  is_video: boolean;
  created_utc: number;
  media?: { reddit_video: RedditVideo };
  preview?: { images: Array<{ source: { url: string } }> };
}

interface MemePost {
  id: string;
  sub: string;
  title: string;
  author: string;
  up: number;
  type: "image" | "gif" | "video";
  media: string;
  bg: string;
  audioUrl?: string;
  t: string;
}

/* ─── Constants ──────────────────────────────────────────────── */

const DEFAULT_SUBREDDITS = [
  "dankmemes",
  "funny",
  "memes",
  "funnyvideos",
  "Funnymemes",
  "shitposting",
  "me_irl",
  "meirl",
  "ProgrammerHumor",
];

const HEADERS_KEY = "reddit_headers";
const SUBS_KEY = "memestok_subs";

/* ─── Helpers ────────────────────────────────────────────────── */

const fmt = (n: number): string => {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

function relTime(utc: number): string {
  const s = Date.now() / 1000 - utc;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function parsePost(raw: RedditPost): MemePost | null {
  if (raw.is_video && raw.media?.reddit_video?.fallback_url) {
    const rv = raw.media.reddit_video;
    const match = rv.fallback_url.match(/v\.redd\.it\/([^/?]+)/);
    const videoId = match?.[1];
    const bg = raw.preview?.images?.[0]?.source?.url ?? "";
    // Prefer the HLS URL: it is a signed stream that includes the audio track
    // and loads natively in WKWebView (AVFoundation) without any proxy.
    // Fall back to fallback_url + separate audio only when hls_url is absent.
    const useHls = !!rv.hls_url && !rv.is_gif;
    return {
      id: raw.id,
      sub: raw.subreddit,
      title: raw.title,
      author: `u/${raw.author}`,
      up: raw.ups,
      type: "video",
      media: useHls ? rv.hls_url! : rv.fallback_url,
      bg,
      audioUrl:
        !useHls && !rv.is_gif && rv.has_audio !== false && videoId
          ? `https://v.redd.it/${videoId}/DASH_audio.mp4`
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
async function fetchSubreddit(
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

function interleave(arrays: MemePost[][]): MemePost[] {
  const out: MemePost[] = [];
  const maxLen = Math.max(0, ...arrays.map((a) => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) out.push(arr[i]);
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── Icons ──────────────────────────────────────────────────── */

type SvgProps = React.SVGProps<SVGSVGElement>;

const Ico = {
  up: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 4l8 9h-5v7H9v-7H4z" />
    </svg>
  ),
  down: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 20l-8-9h5V4h6v7h5z" />
    </svg>
  ),
  eye: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  ),
  mute: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 9h4l5-5v16l-5-5H4z" />
      <line x1="17" y1="8" x2="22" y2="16" />
      <line x1="22" y1="8" x2="17" y2="16" />
    </svg>
  ),
  sound: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 9h4l5-5v16l-5-5H4z" />
      <path d="M16 8a5 5 0 010 8" />
      <path d="M19 5a9 9 0 010 14" />
    </svg>
  ),
  play: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M6 4l14 8-14 8z" />
    </svg>
  ),
  logout: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  key: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3" />
    </svg>
  ),
  plus: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  subs: (p: SvgProps) => (
    <svg viewBox="0 0 24 24" {...p}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="17" y2="18" />
      <circle cx="20" cy="18" r="2" />
      <line x1="22" y1="16" x2="20" y2="18" />
    </svg>
  ),
};

/* ─── Setup Screen ───────────────────────────────────────────── */

interface SetupScreenProps {
  onSave: (headersJson: string) => void;
  isExpired?: boolean;
}

/**
 * Parse the headers object from a "Copy as fetch" or "Copy as cURL (bash)"
 * paste.  Returns null if no cookie header is found.
 */
function parseHeadersFromPaste(text: string): Record<string, string> | null {
  const t = text.trim();

  // ── "Copy as fetch" (Chrome/Edge) ─────────────────────────────────────────
  // Format: fetch("url", { "headers": { "key": "value", ... }, ... })
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

  // ── "Copy as cURL (bash)" ─────────────────────────────────────────────────
  // Format: -H 'key: value' or -H "key: value"
  // macOS Chrome also emits -b 'cookie-string' instead of -H 'cookie: ...'
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

function SetupScreen({ onSave, isExpired }: SetupScreenProps) {
  const [value, setValue] = useState("");
  const [parsed, setParsed] = useState<Record<string, string> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = (text: string) => {
    setValue(text);
    if (!text.trim()) {
      setParsed(null);
      setParseError(null);
      return;
    }
    const result = parseHeadersFromPaste(text);
    if (result) {
      setParsed(result);
      setParseError(null);
    } else if (text.length > 80) {
      setParsed(null);
      setParseError(
        "Could not find a cookie in the pasted text. Make sure you used Copy → Copy as cURL (bash) from the Network tab.",
      );
    } else {
      setParsed(null);
      setParseError(null);
    }
  };

  const handleSave = () => {
    if (!parsed) return;
    const json = JSON.stringify(parsed);
    localStorage.setItem(HEADERS_KEY, json);
    onSave(json);
  };

  const cookiePreview = parsed?.cookie
    ? parsed.cookie.slice(0, 72) + (parsed.cookie.length > 72 ? "…" : "")
    : null;

  return (
    <div className="setupScreen">
      <div className="setupCard">
        <div className="setupTitle">
          Memes<span style={{ color: "#ff8a5c" }}>Tok</span>
        </div>

        {isExpired && (
          <div className="setupExpired">
            Your Reddit session may have expired. Please paste a fresh copy.
          </div>
        )}

        <div className="setupSub">
          Paste a <strong>Copy as cURL (bash)</strong> request from DevTools —
          MemesTok will extract your credentials automatically. No manual
          copying needed.
        </div>

        <div className="setupSteps">
          <strong style={{ display: "block", marginBottom: 6 }}>
            How to copy your request:
          </strong>
          <ol>
            <li>
              Open <strong>reddit.com</strong> in your browser and log in.
            </li>
            <li>
              Press <code>F12</code> → <strong>Network</strong> tab → reload the
              page (<code>F5</code>).
            </li>
            <li>
              Right-click the <strong>first</strong> request to{" "}
              <code>www.reddit.com</code> in the list.
            </li>
            <li>
              Click <strong>Copy → Copy as cURL (bash)</strong>.
            </li>
            <li>
              Paste the <em>entire</em> copied text into the box below — it will
              be parsed automatically.
            </li>
          </ol>
        </div>

        {parsed && (
          <div
            style={{
              background: "rgba(80,200,80,.1)",
              border: "1px solid rgba(80,200,80,.35)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 12.5,
              color: "rgba(255,255,255,.8)",
              lineHeight: 1.5,
            }}
          >
            ✓ Parsed {Object.keys(parsed).length} headers successfully
            <br />
            <code
              style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-all" }}
            >
              cookie: {cookiePreview}
            </code>
          </div>
        )}

        {parseError && (
          <div className="setupExpired" style={{ marginBottom: 14 }}>
            {parseError}
          </div>
        )}

        <textarea
          className="setupTextarea"
          placeholder={'Paste the full output of "Copy as cURL (bash)" here…'}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          rows={6}
          spellCheck={false}
          autoComplete="off"
        />

        <button className="setupBtn" disabled={!parsed} onClick={handleSave}>
          Save &amp; Load Memes
        </button>

        <div className="setupNote">
          Headers are stored only in your local app data and sent only to
          Reddit.
        </div>
      </div>
    </div>
  );
}

/* ─── Subreddit Manager ─────────────────────────────────────── */

interface SubredditManagerProps {
  subreddits: string[];
  onSave: (newSubs: string[]) => void;
  onClose: () => void;
}

function SubredditManager({
  subreddits,
  onSave,
  onClose,
}: SubredditManagerProps) {
  const [list, setList] = useState<string[]>(subreddits);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const val = input
      .trim()
      .replace(/^\/?(r\/)?/, "")
      .replace(/\s+/g, "");
    if (!val) return;
    if (list.some((s) => s.toLowerCase() === val.toLowerCase())) {
      setError("Already in your list");
      return;
    }
    setList((prev) => [...prev, val]);
    setInput("");
    setError(null);
  };

  const handleRemove = (sub: string) => {
    setList((prev) => prev.filter((s) => s !== sub));
    setError(null);
  };

  const handleSave = () => {
    if (list.length === 0) {
      setError("Add at least one subreddit");
      return;
    }
    localStorage.setItem(SUBS_KEY, JSON.stringify(list));
    onSave(list);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="subMgrScreen">
      <div className="subMgrCard">
        <div className="subMgrHeader">
          <div className="subMgrTitle">Manage Subreddits</div>
          <button
            className="ico subMgrClose"
            onClick={onClose}
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="subMgrSub">
          Add or remove subreddits. Changes reload your feed.
        </div>

        <div className="subList">
          {list.map((sub) => (
            <div key={sub} className="subChip">
              <span>r/{sub}</span>
              <button
                className="subChipRemove"
                onClick={() => handleRemove(sub)}
                aria-label={`remove r/${sub}`}
              >
                ✕
              </button>
            </div>
          ))}
          {list.length === 0 && (
            <div className="subListEmpty">No subreddits — add some below.</div>
          )}
        </div>

        {error && <div className="subMgrError">{error}</div>}

        <div className="subAddRow">
          <input
            className="subAddInput"
            placeholder="subreddit name…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="subAddBtn ico"
            onClick={handleAdd}
            aria-label="add subreddit"
          >
            <Ico.plus
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </button>
        </div>

        <button
          className="subMgrReset"
          onClick={() => {
            setList(DEFAULT_SUBREDDITS);
            setError(null);
          }}
        >
          Reset to defaults
        </button>

        <button
          className="setupBtn"
          onClick={handleSave}
          disabled={list.length === 0}
        >
          Save &amp; Reload Feed
        </button>
      </div>
    </div>
  );
}

/* ─── Rail ───────────────────────────────────────────────────── */

function Rail({ post }: { post: MemePost }) {
  const [voted, setVoted] = useState(0);
  const count = post.up + (voted === 1 ? 1 : voted === -1 ? -1 : 0);
  return (
    <div className="rail">
      <div className="railGrp">
        <button
          className={"ico voteBtn" + (voted === 1 ? " on" : "")}
          style={voted === 1 ? { color: "#ffffff" } : undefined}
          onClick={() => setVoted((v) => (v === 1 ? 0 : 1))}
          aria-label="upvote"
        >
          <Ico.up width="30" height="30" fill="currentColor" />
        </button>
        <span
          className="voteCount"
          style={voted === 1 ? { color: "#ffffff" } : undefined}
        >
          {fmt(count)}
        </span>
        <button
          className={"ico voteBtn" + (voted === -1 ? " on dn" : "")}
          onClick={() => setVoted((v) => (v === -1 ? 0 : -1))}
          aria-label="downvote"
        >
          <Ico.down width="30" height="30" fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

/* ─── Slide ──────────────────────────────────────────────────── */

interface SlideProps {
  post: MemePost;
  active: boolean;
  volume: number;
  setVolume: (v: number) => void;
  headersJson: string;
}

function Slide({ post, active, volume, setVolume, headersJson }: SlideProps) {
  const isVideo = post.type === "video";
  // When there is no separate audioUrl the video element IS the audio source
  // (HLS stream with audio track). When audioUrl is set the video is muted and
  // a separate <audio> element carries the sound.
  const videoHasAudio = isVideo && !post.audioUrl;
  const muted = volume === 0;
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [prog, setProg] = useState(0);
  const [hasAudio, setHasAudio] = useState(!!post.audioUrl);
  const [showVol, setShowVol] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userPausedRef = useRef(false);
  // Holds the revocable blob URL for the audio so we can clean it up.
  const audioBlobUrlRef = useRef<string | null>(null);
  // Tracks the audioUrl that was already fetched so we don't re-fetch on
  // every activation after the first.
  const fetchedForRef = useRef<string | null>(null);
  // Last non-zero volume, used to restore when the mute icon is clicked.
  const prevVolRef = useRef(volume > 0 ? volume : 1);
  useEffect(() => {
    if (volume > 0) prevVolRef.current = volume;
  }, [volume]);
  // Close the volume panel when this slide scrolls out of view.
  useEffect(() => {
    if (!active) setShowVol(false);
  }, [active]);

  // Play audio imperatively — avoids the React state→render→effect timing race.
  const playAudio = useCallback(
    (audio: HTMLAudioElement) => {
      audio.muted = true; // satisfy autoplay policy, then restore
      audio.volume = volume > 0 ? volume : 1;
      audio
        .play()
        .then(() => {
          audio.muted = volume === 0;
        })
        .catch((e) => console.error("[audio play]", e));
    },
    [volume],
  );

  // Fetch the audio track through the Tauri backend (with user's auth headers).
  // We set audio.src and call play() imperatively so there is no race between
  // React state updates and the effect that calls play().
  useEffect(() => {
    if (!active || !post.audioUrl || !hasAudio || !headersJson) return;
    const audio = audioRef.current;
    if (!audio) return;

    // Already fetched for this post — just play from the cached blob URL.
    if (fetchedForRef.current === post.audioUrl && audioBlobUrlRef.current) {
      playAudio(audio);
      return;
    }

    let cancelled = false;
    invoke<string>("fetch_media", { url: post.audioUrl, headersJson })
      .then((b64) => {
        if (cancelled) return;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        // Revoke previous blob URL for this post (if any).
        if (audioBlobUrlRef.current)
          URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = blobUrl;
        fetchedForRef.current = post.audioUrl ?? null;
        // Set src directly on the DOM element — no React state update needed.
        audio.src = blobUrl;
        playAudio(audio);
      })
      .catch((e) => {
        console.error("[fetch_media] failed for", post.audioUrl, e);
        if (!cancelled) setHasAudio(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, post.audioUrl, hasAudio, headersJson, playAudio]);

  // Revoke blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (active) {
      userPausedRef.current = false;
      setBuffering(true);
      if (videoHasAudio) {
        // HLS: audio is in the video stream — use the same muted-autoplay trick.
        video!.muted = true;
        video!
          .play()
          .then(() => {
            video!.muted = muted;
          })
          .catch((e) => console.error("[video play]", e));
      } else {
        video?.play().catch(() => {});
      }
      // Fallback audio started imperatively by the fetch effect once blob ready.
    } else {
      setBuffering(false);
      video?.pause();
      if (video) video.currentTime = 0;
      audio?.pause();
      if (audio) audio.currentTime = 0;
    }
  }, [active, isVideo, videoHasAudio, muted]);

  // Sync volume/muted to both video (HLS) and audio (fallback) elements.
  useEffect(() => {
    const isMuted = volume === 0;
    if (videoHasAudio && videoRef.current) {
      videoRef.current.muted = isMuted;
      if (!isMuted) videoRef.current.volume = volume;
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      if (!isMuted) audioRef.current.volume = volume;
    }
  }, [volume, videoHasAudio]);

  const handleClick = () => {
    if (!isVideo) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video?.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
      if (audio && audioBlobUrlRef.current) playAudio(audio);
    } else {
      userPausedRef.current = true;
      video?.pause();
      audio?.pause();
    }
  };

  const handlePlay = () => setPaused(false);
  const handlePause = () => {
    if (userPausedRef.current) setPaused(true);
  };

  const handleEnded = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    if (audio && audioBlobUrlRef.current) {
      audio.currentTime = 0;
      playAudio(audio);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !video.duration) return;
    setProg(video.currentTime / video.duration);
    if (
      audio &&
      hasAudio &&
      Math.abs(video.currentTime - audio.currentTime) > 0.3
    ) {
      audio.currentTime = video.currentTime;
    }
  };

  const bgUrl = post.bg || post.media;

  return (
    <section className="slide" data-screen-label={post.sub}>
      <div className="bg" style={{ backgroundImage: `url(${bgUrl})` }} />

      {isVideo ? (
        <video
          ref={videoRef}
          className="media contain"
          src={post.media}
          playsInline
          muted={!videoHasAudio}
          preload="none"
          onPlay={handlePlay}
          onPause={handlePause}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
          onWaiting={() => setBuffering(true)}
          onClick={handleClick}
        />
      ) : (
        <img
          className="media contain"
          src={post.media}
          alt=""
          draggable={false}
          onLoad={() => setImgLoaded(true)}
        />
      )}

      {isVideo && active && buffering && !paused && (
        <div className="mediaSpinner">
          <div className="spinner" />
        </div>
      )}
      {!isVideo && !imgLoaded && (
        <div className="mediaSpinner">
          <div className="spinner" />
        </div>
      )}

      {post.audioUrl && hasAudio && (
        <audio
          ref={audioRef}
          preload="none"
          muted
          onError={() => setHasAudio(false)}
        />
      )}

      {post.type !== "image" && (
        <div className="badge">{post.type === "gif" ? "GIF" : "VIDEO"}</div>
      )}

      {isVideo && paused && active && (
        <div className="pauseOverlay">
          <Ico.play width="64" height="64" fill="rgba(255,255,255,.92)" />
        </div>
      )}

      <div className="scrim top" />
      <div className="scrim bot" />

      <div className="info top">
        <div className="title">{post.title}</div>
        <div className="sub">
          <span className="subTag">r/{post.sub}</span>
          <span className="dot">.</span>
          <span className="muted">{post.author}</span>
          <span className="dot">.</span>
          <span className="muted">{post.t}</span>
        </div>
      </div>

      <Rail post={post} />

      {isVideo && (
        <div className="soundControl">
          {showVol && (
            <div className="volumePanel">
              <input
                type="range"
                className="volumeSlider"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0) prevVolRef.current = v;
                  setVolume(v);
                }}
                aria-label="volume"
              />
            </div>
          )}
          <button
            className="soundBtn ico"
            onClick={() => {
              if (volume === 0) {
                setVolume(prevVolRef.current);
              } else {
                setShowVol((v) => !v);
              }
            }}
            aria-label="sound"
          >
            {volume === 0 ? (
              <Ico.mute
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <Ico.sound
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </button>
        </div>
      )}

      {isVideo && (
        <div className="progress">
          <div
            className="bar"
            style={{ width: `${active ? prog * 100 : 0}%` }}
          />
        </div>
      )}
    </section>
  );
}

/* ─── App ────────────────────────────────────────────────────── */

type Filter = "all" | "image" | "gif" | "video";

const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["image", "Images"],
  ["gif", "GIFs"],
  ["video", "Videos"],
];

export default function App() {
  const scroller = useRef<HTMLDivElement>(null);
  const postsRef = useRef<MemePost[]>([]);
  const lastNav = useRef(0);

  const [headersJson, setHeadersJson] = useState<string | null>(() =>
    localStorage.getItem(HEADERS_KEY),
  );
  const [cookieExpired, setCookieExpired] = useState(false);
  const [showSetup, setShowSetup] = useState(
    () => !localStorage.getItem(HEADERS_KEY),
  );
  const [subreddits, setSubreddits] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SUBS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SUBREDDITS;
  });
  const [showSubMgr, setShowSubMgr] = useState(false);

  const [allPosts, setAllPosts] = useState<MemePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const afterMapRef = useRef<Record<string, string | null>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [idx, setIdx] = useState(() => {
    const s = parseInt(localStorage.getItem("memestok_idx") ?? "0", 10);
    return isNaN(s) ? 0 : s;
  });
  const [hideUI, setHideUI] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem("memestok_vol") ?? "1");
    return isNaN(saved) ? 1 : Math.max(0, Math.min(1, saved));
  });
  const prevVolumeRef = useRef(1);
  useEffect(() => {
    localStorage.setItem("memestok_vol", String(volume));
  }, [volume]);

  const loadPosts = useCallback(
    (activeHeadersJson: string, activeSubs: string[]) => {
      afterMapRef.current = {};
      startTransition(() => {
        setLoading(true);
        setError(null);
        setAllPosts([]);
        setHasMore(true);
      });
      Promise.allSettled(
        activeSubs.map((sub) => fetchSubreddit(sub, activeHeadersJson)),
      ).then((results) => {
        const newAfterMap: Record<string, string | null> = {};
        const fulfilled: MemePost[][] = [];
        const rejected: PromiseRejectedResult[] = [];
        results.forEach((r, i) => {
          const sub = activeSubs[i];
          if (r.status === "fulfilled") {
            newAfterMap[sub] = r.value.after;
            fulfilled.push(r.value.posts);
          } else {
            rejected.push(r as PromiseRejectedResult);
          }
        });
        afterMapRef.current = newAfterMap;
        if (fulfilled.length === 0) {
          const reason = String(rejected[0]?.reason ?? "Unknown error");
          if (
            reason.includes("403") ||
            reason.includes("401") ||
            reason.includes("non-JSON")
          ) {
            setCookieExpired(true);
            setShowSetup(true);
            setLoading(false);
          } else {
            setError(reason);
            setLoading(false);
          }
        } else {
          setCookieExpired(false);
          setAllPosts(shuffle(interleave(fulfilled)));
          setHasMore(activeSubs.some((sub) => !!afterMapRef.current[sub]));
          setLoading(false);
        }
      });
    },
    [],
  );

  const loadMore = useCallback(
    (activeHeadersJson: string, activeSubs: string[]) => {
      setLoadingMore(true);
      Promise.allSettled(
        activeSubs.map((sub) => {
          const after = afterMapRef.current[sub];
          if (!after)
            return Promise.resolve({ posts: [] as MemePost[], after: null });
          return fetchSubreddit(sub, activeHeadersJson, after);
        }),
      ).then((results) => {
        const newAfterMap = { ...afterMapRef.current };
        const arrays: MemePost[][] = [];
        results.forEach((r, i) => {
          const sub = activeSubs[i];
          if (r.status === "fulfilled" && r.value.posts.length > 0) {
            newAfterMap[sub] = r.value.after;
            arrays.push(r.value.posts);
          }
        });
        afterMapRef.current = newAfterMap;
        const newPosts = shuffle(interleave(arrays));
        if (newPosts.length > 0) {
          setAllPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newPosts.filter((p) => !seen.has(p.id))];
          });
        }
        setHasMore(activeSubs.some((sub) => !!afterMapRef.current[sub]));
        setLoadingMore(false);
      });
    },
    [],
  );

  useEffect(() => {
    if (!showSetup && headersJson) {
      loadPosts(headersJson, subreddits);
    }
  }, [showSetup, headersJson, loadPosts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHeadersSave = (newHeadersJson: string) => {
    setHeadersJson(newHeadersJson);
    setShowSetup(false);
    setCookieExpired(false);
  };

  const handleSubsSave = (newSubs: string[]) => {
    setSubreddits(newSubs);
    setShowSubMgr(false);
    if (headersJson) loadPosts(headersJson, newSubs);
  };

  const posts = allPosts.filter((p) => filter === "all" || p.type === filter);

  useEffect(() => {
    postsRef.current = posts;
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = Math.min(idx, posts.length - 1) * el.clientHeight;
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll: load more posts when approaching the end of the feed.
  useEffect(() => {
    if (!headersJson || loading || loadingMore || !hasMore) return;
    if (posts.length === 0) return;
    if (posts.length < 8 || idx >= posts.length - 8) {
      loadMore(headersJson, subreddits);
    }
  }, [
    idx,
    posts.length,
    headersJson,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    subreddits,
  ]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setIdx((prev) => {
      if (i !== prev) {
        localStorage.setItem("memestok_idx", String(i));
        return i;
      }
      return prev;
    });
  }, []);

  const go = useCallback((delta: number) => {
    const el = scroller.current;
    if (!el) return;
    const now = performance.now();
    if (now - lastNav.current < 240) return;
    lastNav.current = now;
    const h = el.clientHeight;
    const cur = Math.round(el.scrollTop / h);
    const next = Math.max(
      0,
      Math.min(postsRef.current.length - 1, cur + delta),
    );
    el.scrollTop = next * h;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && /input|textarea/i.test((e.target as HTMLElement).tagName))
        return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "h" || e.key === "H") setHideUI((v) => !v);
      else if (e.key === "m" || e.key === "M")
        setVolume((v) => {
          if (v > 0) {
            prevVolumeRef.current = v;
            return 0;
          }
          return prevVolumeRef.current;
        });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (showSetup) {
    return <SetupScreen onSave={handleHeadersSave} isExpired={cookieExpired} />;
  }

  if (showSubMgr) {
    return (
      <SubredditManager
        subreddits={subreddits}
        onSave={handleSubsSave}
        onClose={() => setShowSubMgr(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="stage">
        <div className="phone loadScreen">
          <div className="wordmark" style={{ fontSize: 28 }}>
            Memes<span style={{ color: "#ff8a5c" }}>Tok</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="loadDot" />
            <span className="loadDot" />
            <span className="loadDot" />
          </div>
          <div style={{ color: "rgba(255,255,255,.45)", fontSize: 12 }}>
            Loading memes from Reddit...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stage">
        <div className="phone loadScreen">
          <div className="wordmark" style={{ fontSize: 28 }}>
            Memes<span style={{ color: "#ff8a5c" }}>Tok</span>
          </div>
          <div
            style={{
              color: "rgba(255,255,255,.65)",
              fontSize: 14,
              maxWidth: 280,
              textAlign: "center",
            }}
          >
            {error}
          </div>
          <button
            className="setupBtn"
            style={{ marginTop: 16, maxWidth: 240 }}
            onClick={() => headersJson && loadPosts(headersJson, subreddits)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stage theme-reddit">
      <div className="phone">
        {!hideUI && (
          <header className="topbar">
            <div className="wordmark">
              Memes<span style={{ color: "#ff8a5c" }}>Tok</span>
            </div>
            <div className="filters">
              {FILTERS.map(([k, lbl]) => (
                <button
                  key={k}
                  className={"chip" + (filter === k ? " on" : "")}
                  style={
                    filter === k
                      ? { color: "#000", background: "#ffffff" }
                      : undefined
                  }
                  onClick={() => {
                    setFilter(k);
                    setIdx(0);
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <button
              className="ico eyeBtn"
              onClick={() => headersJson && loadPosts(headersJson, subreddits)}
              aria-label="refresh"
              title="Refresh feed"
              style={{ opacity: 0.55 }}
            >
              <Ico.logout
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </button>
            <button
              className="ico eyeBtn"
              onClick={() => setShowSubMgr(true)}
              aria-label="manage subreddits"
              title="Manage subreddits"
            >
              <Ico.subs
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </button>
            <button
              className="ico eyeBtn"
              onClick={() => setShowSetup(true)}
              aria-label="change cookie"
              title="Change Reddit cookie"
            >
              <Ico.key
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </button>
            <button
              className="ico eyeBtn"
              onClick={() => setHideUI(true)}
              aria-label="hide interface"
            >
              <Ico.eye
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </button>
          </header>
        )}

        {hideUI && (
          <button
            className="ico showUI"
            onClick={() => setHideUI(false)}
            aria-label="show interface"
          >
            <Ico.eye
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </button>
        )}

        <div
          className={"feed" + (hideUI ? " bare" : "")}
          ref={scroller}
          onScroll={onScroll}
        >
          {posts.length === 0 && (
            <div className="empty">no {filter}s right now</div>
          )}
          {posts.map((p, i) => (
            <Slide
              key={p.id}
              post={p}
              active={i === idx}
              volume={volume}
              setVolume={setVolume}
              headersJson={headersJson ?? ""}
            />
          ))}
        </div>

        {loadingMore && (
          <div className="moreLoader">
            <span className="loadDot" />
            <span className="loadDot" />
            <span className="loadDot" />
          </div>
        )}

        {!hideUI && (
          <div className="khint">arrow keys navigate · H hide · M mute</div>
        )}
      </div>
    </div>
  );
}
