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

const SUBREDDITS = [
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
        !rv.is_gif && videoId
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
): Promise<MemePost[]> {
  const text = await invoke<string>("fetch_reddit", {
    subreddit: sub,
    headersJson,
  });
  let json: { data: { children: Array<{ data: RedditPost }> } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${sub}: Reddit returned non-JSON`);
  }
  return json.data.children
    .map((c) => parsePost(c.data))
    .filter((p): p is MemePost => p !== null);
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
  const headers: Record<string, string> = {};
  const re = /-H\s+(?:'([^']+)'|"([^"]+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const raw = m[1] ?? m[2];
    const ci = raw.indexOf(":");
    if (ci === -1) continue;
    headers[raw.slice(0, ci).trim().toLowerCase()] = raw.slice(ci + 1).trim();
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
  muted: boolean;
  setMuted: (v: boolean) => void;
}

function Slide({ post, active, muted, setMuted }: SlideProps) {
  const isVideo = post.type === "video";
  const [paused, setPaused] = useState(false);
  const [prog, setProg] = useState(0);
  const [hasAudio, setHasAudio] = useState(!!post.audioUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userPausedRef = useRef(false);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (active) {
      userPausedRef.current = false;
      video?.play().catch(() => {});
      audio?.play().catch(() => {});
    } else {
      video?.pause();
      if (video) video.currentTime = 0;
      audio?.pause();
      if (audio) audio.currentTime = 0;
    }
  }, [active, isVideo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const handleClick = () => {
    if (!isVideo) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video?.paused) {
      userPausedRef.current = false;
      video?.play().catch(() => {});
      audio?.play().catch(() => {});
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
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
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
          muted
          preload="none"
          onPlay={handlePlay}
          onPause={handlePause}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onClick={handleClick}
        />
      ) : (
        <img
          className="media contain"
          src={post.media}
          alt=""
          draggable={false}
        />
      )}

      {post.audioUrl && hasAudio && (
        <audio
          ref={audioRef}
          src={post.audioUrl}
          preload="none"
          muted={muted}
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
        <button
          className="soundBtn ico"
          onClick={() => setMuted(!muted)}
          aria-label="sound"
        >
          {muted ? (
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

  const [allPosts, setAllPosts] = useState<MemePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [idx, setIdx] = useState(() => {
    const s = parseInt(localStorage.getItem("memestok_idx") ?? "0", 10);
    return isNaN(s) ? 0 : s;
  });
  const [hideUI, setHideUI] = useState(false);
  const [muted, setMuted] = useState(false);

  const loadPosts = useCallback((activeHeadersJson: string) => {
    startTransition(() => {
      setLoading(true);
      setError(null);
      setAllPosts([]);
    });
    Promise.allSettled(
      SUBREDDITS.map((sub) => fetchSubreddit(sub, activeHeadersJson)),
    ).then((results) => {
      const fulfilled = results
        .filter(
          (r): r is PromiseFulfilledResult<MemePost[]> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
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
        setAllPosts(interleave(fulfilled));
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!showSetup && headersJson) {
      loadPosts(headersJson);
    }
  }, [showSetup, headersJson, loadPosts]);

  const handleHeadersSave = (newHeadersJson: string) => {
    setHeadersJson(newHeadersJson);
    setShowSetup(false);
    setCookieExpired(false);
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
      else if (e.key === "m" || e.key === "M") setMuted((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (showSetup) {
    return <SetupScreen onSave={handleHeadersSave} isExpired={cookieExpired} />;
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
            onClick={() => headersJson && loadPosts(headersJson)}
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
              onClick={() => headersJson && loadPosts(headersJson)}
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
              muted={muted}
              setMuted={setMuted}
            />
          ))}
        </div>

        {!hideUI && (
          <div className="khint">arrow keys navigate · H hide · M mute</div>
        )}
      </div>
    </div>
  );
}
