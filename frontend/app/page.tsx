"use client";

import { createPortal } from "react-dom";
import { FormEvent, useState } from "react";

type Segment = { message: string; pinyin: string; original: string };
type HelloResponse = { message: string; pinyin?: string; original?: string };

type TooltipState = { index: number; left: number; top: number } | null;

type VerbosityLevel = "modest" | "adequate" | "rich";

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateSectionOpen, setGenerateSectionOpen] = useState(false);
  const [verbosity, setVerbosity] = useState<VerbosityLevel>("adequate");
  const [temperature, setTemperature] = useState(0.7);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setResult("");

    try {
      const res = await fetch(
        `http://localhost:8000/translate/${encodeURIComponent(value)}`,
      );

      if (!res.ok) {
        setError(`Error from backend: ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed) as HelloResponse;
              if (data.message != null) {
                setResult((prev) => [
                  ...prev,
                  {
                    message: data.message,
                    pinyin: data.pinyin ?? "",
                    original: data.original ?? "",
                  },
                ]);
                await new Promise((r) => setTimeout(r, 0));
              }
            } catch {
              // skip malformed line
            }
          }
        }
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim()) as HelloResponse;
            if (data.message != null) {
              setResult((prev) => [
                ...prev,
                {
                  message: data.message,
                  pinyin: data.pinyin ?? "",
                  original: data.original ?? "",
                },
              ]);
            }
          } catch {
            // skip
          }
        }
      } else {
        const data = (await res.json()) as HelloResponse;
        setResult(
          data.message != null
            ? [
                {
                  message: data.message,
                  pinyin: data.pinyin ?? "",
                  original: data.original ?? "",
                },
              ]
            : [],
        );
      }
    } catch {
      setError("Could not reach backend");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerateLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (generatePrompt.trim()) params.set("prompt", generatePrompt.trim());
      params.set("temperature", String(temperature));
      params.set("verbosity", verbosity);
      const res = await fetch(`http://localhost:8000/generate?${params}`);
      if (!res.ok) {
        setError(`Generate failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as { text?: string };
      if (data.text != null) setText(data.text);
    } catch {
      setError("Could not reach backend");
    } finally {
      setGenerateLoading(false);
    }
  };

  const boxHeight = "min(420px, 50vh)";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
      }}
    >
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #2d3238 0%, #1e2226 100%)",
          color: "#c8cdd2",
          padding: "clamp(1.5rem, 4vw, 3rem)",
          justifyContent: "flex-start",
          minWidth: 0,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: "clamp(1rem, 3vw, 1.5rem)",
            color: "#9ca3af",
          }}
        >
          Forge a Verse
        </h1>
        <div
          style={{
            marginBottom: "clamp(1rem, 3vw, 1.5rem)",
            borderRadius: "10px",
            background: "#252a30",
            border: "1px solid #3d444d",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setGenerateSectionOpen((o) => !o)}
            style={{
              width: "100%",
              padding: "0.6rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "none",
              background: "transparent",
              color: "#9ca3af",
              fontSize: "0.9rem",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span>Generate options (optional)</span>
            <span style={{ fontSize: "0.7rem" }}>
              {generateSectionOpen ? "▲" : "▼"}
            </span>
          </button>
          {generateSectionOpen && (
            <div
              style={{
                padding: "0 1rem 0.75rem 1rem",
                borderTop: "1px solid #3d444d",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                  marginBottom: "0.35rem",
                  marginTop: "0.5rem",
                }}
              >
                Prompt (optional)
              </label>
              <input
                type="text"
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="e.g. Harry Potter ends up teaming up with Voldemort"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #3d444d",
                  background: "#1e2226",
                  color: "#e5e7eb",
                  fontSize: "0.9rem",
                  marginBottom: "0.75rem",
                }}
              />
              <div style={{ marginBottom: "0.6rem" }}>
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                    marginRight: "0.5rem",
                  }}
                >
                  Verbosity
                </span>
                {(["modest", "adequate", "rich"] as const).map((v) => (
                  <label
                    key={v}
                    style={{
                      marginRight: "0.75rem",
                      fontSize: "0.85rem",
                      color: "#c8cdd2",
                    }}
                  >
                    <input
                      type="radio"
                      name="verbosity"
                      checked={verbosity === v}
                      onChange={() => setVerbosity(v)}
                      style={{ marginRight: "0.25rem" }}
                    />
                    {v}
                  </label>
                ))}
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  Temperature: {temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  style={{ width: "100%", marginTop: "0.25rem" }}
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateLoading}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "#4b5563",
                  color: "#e5e7eb",
                  fontSize: "0.85rem",
                  cursor: generateLoading ? "not-allowed" : "pointer",
                  opacity: generateLoading ? 0.7 : 1,
                }}
              >
                {generateLoading ? "Generating…" : "Generate"}
              </button>
            </div>
          )}
        </div>
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: boxHeight,
              minHeight: boxHeight,
              maxWidth: "100%",
              borderRadius: "12px",
              border: "1px solid #3d444d",
              background: "#252a30",
              overflow: "hidden",
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste text to translate…"
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                padding: "1rem 1.25rem 0.5rem",
                border: "none",
                background: "transparent",
                color: "#e5e7eb",
                fontSize: "1rem",
                lineHeight: 1.6,
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <div style={{ padding: "0.5rem 1rem 0.75rem", flexShrink: 0 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "#374151",
                  color: "#e5e7eb",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "background 0.2s",
                }}
              >
                {loading ? "Translating…" : "Translate"}
              </button>
            </div>
          </div>
          {error && (
            <p
              style={{
                marginTop: "0.75rem",
                color: "#f87171",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </p>
          )}
        </form>
      </section>

      <div
        style={{
          width: "1px",
          background:
            "linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.4), transparent)",
          flexShrink: 0,
        }}
      />

      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background:
            "linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4c1d95 70%, #831843 100%)",
          color: "#f3e8ff",
          padding: "clamp(1.5rem, 4vw, 3rem)",
          minWidth: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setHelpModalOpen(true)}
          aria-label="How to use"
          style={{
            position: "absolute",
            top: "clamp(1rem, 2.5vw, 1.25rem)",
            right: "clamp(1rem, 2.5vw, 1.25rem)",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            border: "1px solid rgba(192, 132, 252, 0.4)",
            background: "rgba(30, 27, 75, 0.6)",
            color: "rgba(243, 232, 255, 0.9)",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ?
        </button>
        <h2
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: "clamp(1rem, 3vw, 1.5rem)",
            color: "rgba(243, 232, 255, 0.95)",
          }}
        >
          Reap the beauty
        </h2>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            height: boxHeight,
            maxHeight: boxHeight,
            borderRadius: "12px",
            border: "1px solid rgba(192, 132, 252, 0.25)",
            background: "rgba(30, 27, 75, 0.5)",
            padding: "clamp(1rem, 2.5vw, 1.5rem)",
            overflow: "auto",
          }}
        >
          {result.length > 0 && !error && (
            <p
              style={{
                margin: 0,
                fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
                lineHeight: 1.7,
                color: "#f3e8ff",
              }}
            >
              {result.map((seg, i) => {
                const isHanja = Boolean(seg.pinyin);
                const isLoanword = Boolean(seg.original && !seg.pinyin);
                const hasTooltip = seg.pinyin || seg.original;
                const auraClass = isHanja
                  ? "result-segment-hanja"
                  : isLoanword
                    ? "result-segment-loanword"
                    : "";
                return hasTooltip ? (
                  <span
                    key={i}
                    className={`result-segment-with-pinyin result-segment-stream-in ${auraClass}`.trim()}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        index: i,
                        left: rect.left + rect.width / 2,
                        top: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {seg.message}
                  </span>
                ) : (
                  <span key={i} className="result-segment-stream-in">
                    {seg.message}
                  </span>
                );
              })}
            </p>
          )}
          {result.length === 0 && !loading && !error && (
            <p
              style={{
                margin: 0,
                color: "rgba(243, 232, 255, 0.45)",
                fontSize: "0.95rem",
              }}
            >
              Your translation will appear here.
            </p>
          )}
        </div>
      </section>
      {tooltip != null &&
        result[tooltip.index] &&
        createPortal(
          <div
            className="result-pinyin-tooltip result-pinyin-tooltip-portal"
            style={{
              position: "fixed",
              left: tooltip.left,
              top: tooltip.top,
              transform: "translate(-50%, -100%) translateY(-6px)",
            }}
            aria-hidden
          >
            {result[tooltip.index].original ? (
              <span className="result-tooltip-original">
                {result[tooltip.index].original}
              </span>
            ) : null}
            {result[tooltip.index].pinyin ? (
              <span className="result-tooltip-pinyin">
                {result[tooltip.index].pinyin}
              </span>
            ) : null}
          </div>,
          document.body,
        )}

      {helpModalOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
              background: "rgba(0, 0, 0, 0.6)",
            }}
            onClick={() => setHelpModalOpen(false)}
          >
            <div
              style={{
                background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
                color: "#f3e8ff",
                borderRadius: "14px",
                border: "1px solid rgba(192, 132, 252, 0.35)",
                maxWidth: "520px",
                width: "100%",
                maxHeight: "85vh",
                overflow: "auto",
                padding: "1.75rem 2rem",
                boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.25rem",
                }}
              >
                <h3
                  id="help-modal-title"
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "1.4rem",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  How to use
                </h3>
                <button
                  type="button"
                  onClick={() => setHelpModalOpen(false)}
                  aria-label="Close"
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(243, 232, 255, 0.8)",
                    fontSize: "1.5rem",
                    cursor: "pointer",
                    lineHeight: 1,
                    padding: "0 0.25rem",
                  }}
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  fontSize: "1.05rem",
                  lineHeight: 1.85,
                  letterSpacing: "0.01em",
                  color: "rgba(243, 232, 255, 0.95)",
                }}
              >
                <p style={{ margin: "0 0 1.1rem" }}>
                  <strong
                    style={{
                      color: "rgba(216, 180, 254, 1)",
                      fontWeight: 600,
                      fontSize: "1.02em",
                    }}
                  >
                    Translate:
                  </strong>{" "}
                  Type or paste English text in the left box, then click
                  Translate. The Korean translation appears on the right, with
                  loanwords and hanja highlighted.
                </p>
                <p style={{ margin: "0 0 1.1rem" }}>
                  <strong
                    style={{
                      color: "rgba(216, 180, 254, 1)",
                      fontWeight: 600,
                      fontSize: "1.02em",
                    }}
                  >
                    Generate text:
                  </strong>{" "}
                  Open “Generate options (optional)” on the left. Enter a prompt,
                  choose verbosity and temperature, then click Generate. The
                  result fills the left text box so you can translate it.
                </p>
                <p style={{ margin: 0 }}>
                  <strong
                    style={{
                      color: "rgba(216, 180, 254, 1)",
                      fontWeight: 600,
                      fontSize: "1.02em",
                    }}
                  >
                    Result panel:
                  </strong>{" "}
                  Hover over yellow-glowing (hanja) or red-glowing (loanword)
                  words to see the original Korean and pinyin in a tooltip.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
