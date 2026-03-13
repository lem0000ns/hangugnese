"use client";

import { createPortal } from "react-dom";
import { FormEvent, useState } from "react";

type Segment = { message: string; pinyin: string; original: string };
type HelloResponse = { message: string; pinyin?: string; original?: string };

type TooltipState = { index: number; left: number; top: number } | null;

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setResult("");

    try {
      const res = await fetch(
        `http://localhost:8000/translate/${encodeURIComponent(value)}`
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
            : []
        );
      }
    } catch {
      setError("Could not reach backend");
    } finally {
      setLoading(false);
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
            marginBottom: "clamp(1.5rem, 4vw, 2.5rem)",
            color: "#9ca3af",
          }}
        >
          Harvest your craft
        </h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
          background: "linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.4), transparent)",
          flexShrink: 0,
        }}
      />

      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4c1d95 70%, #831843 100%)",
          color: "#f3e8ff",
          padding: "clamp(1.5rem, 4vw, 3rem)",
          minWidth: 0,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: "clamp(1.5rem, 4vw, 2.5rem)",
            color: "rgba(243, 232, 255, 0.95)",
          }}
        >
          Reap the beauty
        </h2>
        <div
          style={{
            height: boxHeight,
            minHeight: boxHeight,
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
                    className={`result-segment-with-pinyin ${auraClass}`.trim()}
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
                  <span key={i}>{seg.message}</span>
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
              <span className="result-tooltip-original">{result[tooltip.index].original}</span>
            ) : null}
            {result[tooltip.index].pinyin ? (
              <span className="result-tooltip-pinyin">{result[tooltip.index].pinyin}</span>
            ) : null}
          </div>,
          document.body
        )}
    </div>
  );
}
