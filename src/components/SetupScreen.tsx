import { useState } from "react";
import { HEADERS_KEY } from "../constants";
import { parseHeadersFromPaste } from "../utils";

export interface SetupScreenProps {
  onSave: (headersJson: string) => void;
  isExpired?: boolean;
}

export function SetupScreen({ onSave, isExpired }: SetupScreenProps) {
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
