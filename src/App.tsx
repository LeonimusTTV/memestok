import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
} from "react";
import "./App.css";
import type { MemePost, Filter } from "./types";
import {
  DEFAULT_SUBREDDITS,
  HEADERS_KEY,
  SUBS_KEY,
  FILTERS,
} from "./constants";
import { fetchSubreddit, interleave, shuffle } from "./utils";
import { Ico } from "./components/Ico";
import { SetupScreen } from "./components/SetupScreen";
import { SubredditManager } from "./components/SubredditManager";
import { Slide } from "./components/Slide";

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
              preload={i > idx && i <= idx + 5}
              volume={volume}
              setVolume={setVolume}
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
