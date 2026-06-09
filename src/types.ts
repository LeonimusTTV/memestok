export interface RedditVideo {
  fallback_url: string;
  hls_url?: string;
  is_gif: boolean;
  has_audio?: boolean;
}

export interface RedditPost {
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

export interface MemePost {
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

export type Filter = "all" | "image" | "gif" | "video";
