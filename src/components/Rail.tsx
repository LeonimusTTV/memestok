import { useState } from "react";
import type { MemePost } from "../types";
import { fmt } from "../utils";
import { Ico } from "./Ico";

export function Rail({ post }: { post: MemePost }) {
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
