import type { Filter } from "./types";

export const DEFAULT_SUBREDDITS = [
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

export const HEADERS_KEY = "reddit_headers";
export const SUBS_KEY = "memestok_subs";

export const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["image", "Images"],
  ["gif", "GIFs"],
  ["video", "Videos"],
];
