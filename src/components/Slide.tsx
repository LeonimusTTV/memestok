import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import type { MemePost } from "../types";
import { Ico } from "./Ico";
import { Rail } from "./Rail";

// Whether hls.js can be used (MSE-based). Takes priority over native HLS
// because WebView2 (Windows, Chromium 107+) reports canPlayType > "" for
// HLS but its native CMAF-HLS implementation only fetches audio and drops
// video. Always use hls.js when MSE is available.
const HLSJS_SUPPORTED = Hls.isSupported();

export interface SlideProps {
  post: MemePost;
  active: boolean;
  preload?: boolean;
  volume: number;
  setVolume: (v: number) => void;
}

export function Slide({
  post,
  active,
  preload = false,
  volume,
  setVolume,
}: SlideProps) {
  const isVideo = post.type === "video";
  // HLS stream carries audio — all video posts with HLS have in-stream audio.
  const isHls = isVideo && post.media.includes(".m3u8");
  // Use hls.js when MSE is available (Windows/Chromium). On macOS/WebKit,
  // MSE is absent so we fall back to the native src path.
  const useHlsJs = isHls && HLSJS_SUPPORTED;
  const muted = volume === 0;
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [prog, setProg] = useState(0);
  const [showVol, setShowVol] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const userPausedRef = useRef(false);
  // Last non-zero volume, used to restore when the mute icon is clicked.
  const prevVolRef = useRef(volume > 0 ? volume : 1);
  // Keep a ref to the current muted state so the play effect can read it
  // without having it as a dependency (which would re-trigger play() on every
  // volume change and cause AbortError + permanent silence).
  const mutedRef = useRef(muted);
  // Keep a ref to active so hls.js event handlers can read it without
  // closing over stale values.
  const activeRef = useRef(active);
  // Set once hls.js MANIFEST_PARSED fires; gates whether play() can be called
  // directly vs waiting for the event.
  const manifestReadyRef = useRef(false);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    if (volume > 0) prevVolRef.current = volume;
  }, [volume]);
  // Track the in-flight video play() promise so we can await it before
  // calling pause(), preventing the AbortError race condition.
  const videoPlayPromiseRef = useRef<Promise<void> | undefined>(undefined);
  // Close the volume panel when this slide scrolls out of view.
  useEffect(() => {
    if (!active) setShowVol(false);
  }, [active]);

  // Destroy hls instance when the post changes or the component unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      manifestReadyRef.current = false;
    },
    [post.media],
  );

  // Single unified playback effect — handles both activation and hls setup.
  // The hls instance is created lazily on first activation so that inactive
  // slides never load data, and there is no race between a setup effect and a
  // play effect calling stopLoad().
  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current!;

    const startPlay = () => {
      video.muted = true;
      const p = video.play();
      videoPlayPromiseRef.current = p;
      p?.then(() => {
        videoPlayPromiseRef.current = undefined;
        video.muted = mutedRef.current;
      }).catch((e) => {
        console.error("[video play]", e);
        videoPlayPromiseRef.current = undefined;
      });
    };

    if (active) {
      userPausedRef.current = false;
      setBuffering(true);

      if (!useHlsJs) {
        // Plain MP4 or native HLS (macOS/WebKit): play via <video src>.
        startPlay();
        return;
      }

      if (hlsRef.current && manifestReadyRef.current) {
        // Slide was seen before — manifest already parsed, resume segments.
        hlsRef.current.startLoad(-1);
        startPlay();
        return;
      }

      // First activation: lazily create the hls.js instance.
      // autoStartLoad:false so segments never load until startLoad() is called,
      // preventing inactive slides from consuming bandwidth.
      hlsRef.current?.destroy();
      manifestReadyRef.current = false;
      const hls = new Hls({ autoStartLoad: false });
      hlsRef.current = hls;
      hls.loadSource(post.media); // fetches the manifest only
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        manifestReadyRef.current = true;
        if (!activeRef.current) return; // deactivated before manifest arrived
        hls.startLoad(-1);
        startPlay();
      });

      hls.on(
        Hls.Events.ERROR,
        (
          _e: unknown,
          data: { fatal: boolean; type: string; details: string },
        ) => {
          console.error("[hls]", data.type, data.details, "fatal:", data.fatal);
        },
      );
    } else {
      setBuffering(false);
      hlsRef.current?.stopLoad();
      const doStop = () => {
        video.pause();
        video.currentTime = 0;
      };
      if (videoPlayPromiseRef.current) {
        videoPlayPromiseRef.current.then(doStop, doStop);
        videoPlayPromiseRef.current = undefined;
      } else {
        doStop();
      }
    }
  }, [active, isVideo, useHlsJs, post.media]);

  // Sync volume/muted to the video element.
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const isMuted = volume === 0;
    videoRef.current.muted = isMuted;
    if (!isMuted) videoRef.current.volume = volume;
  }, [volume, isVideo]);

  const handleClick = () => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (video?.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      video?.pause();
    }
  };

  const handlePlay = () => setPaused(false);
  const handlePause = () => {
    if (userPausedRef.current) setPaused(true);
  };

  const handleEnded = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProg(video.currentTime / video.duration);
  };

  const bgUrl = post.bg || post.media;

  return (
    <section className="slide" data-screen-label={post.sub}>
      <div className="bg" style={{ backgroundImage: `url(${bgUrl})` }} />

      {isVideo ? (
        <video
          ref={videoRef}
          className="media contain"
          src={useHlsJs ? undefined : post.media}
          playsInline
          muted
          preload={useHlsJs ? "none" : preload || active ? "auto" : "none"}
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
