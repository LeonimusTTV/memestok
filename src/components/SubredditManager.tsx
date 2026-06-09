import { useState } from "react";
import { DEFAULT_SUBREDDITS, SUBS_KEY } from "../constants";
import { Ico } from "./Ico";

export interface SubredditManagerProps {
  subreddits: string[];
  onSave: (newSubs: string[]) => void;
  onClose: () => void;
}

export function SubredditManager({
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
