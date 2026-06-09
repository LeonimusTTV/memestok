import { useState, useEffect, useRef, useCallback } from "react";
import type { MemePost } from "../types";
import { Ico } from "./Ico";
import { Rail } from "./Rail";

export interface SlideProps {
  post: MemePost;
  active: boolean;
  preload?: boolean;
  volume: number;
  setVolume: (v: number) => void;
  headersJson: string;
}

export function Slide({
  post,
  active,
  preload = false,
  volume,
  setVolume,
}: SlideProps) {
  const isVideo = post.type === "video";

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

  useEffect(() => {
    if (!isVideo || active) return;
    const video = videoRef.current;
    if (!video) return;
    if (preload) {
      video.load();
      audioRef.current?.load();
    }
  }, [preload, isVideo, active]);

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
        // Audio src is set directly in JSX (hls_url) — play it here.
        if (audio && hasAudio) {
          audio.muted = true;
          audio
            .play()
            .then(() => {
              audio.muted = muted;
            })
            .catch(() => {});
        }
      }
    } else {
      setBuffering(false);
      video?.pause();
      if (video) video.currentTime = 0;
      audio?.pause();
      if (audio) audio.currentTime = 0;
    }
  }, [active, isVideo, videoHasAudio, muted, hasAudio]);

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
      if (audio && hasAudio) playAudio(audio);
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
    if (audio && hasAudio) {
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
          preload={preload || active ? "auto" : "none"}
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
          src={post.audioUrl}
          preload={active || preload ? "auto" : "none"}
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
