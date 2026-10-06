"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useState,
} from "react";

type Segment = { message: string; pinyin: string; original: string };
type HelloResponse = { message: string; pinyin?: string; original?: string };

type TooltipState = { index: number; left: number; top: number } | null;

type VerbosityLevel = "modest" | "adequate" | "rich";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://hangugnese.onrender.com";

const toSegment = (data: HelloResponse): Segment => ({
  message: data.message,
  pinyin: data.pinyin ?? "",
  original: data.original ?? "",
});

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
  const [tooltipDefinition, setTooltipDefinition] = useState<string | null>(
    null,
  );
  const [tooltipLoading, setTooltipLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setHelpModalOpen(false);
      setTooltip(null);
    };
    const onScroll = () => setTooltip(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setResult([]);

    try {
      const res = await fetch(
        `${API_BASE}/translate/${encodeURIComponent(value)}`,
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
                setResult((prev) => [...prev, toSegment(data)]);
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
              setResult((prev) => [...prev, toSegment(data)]);
            }
          } catch {
            // skip
          }
        }
      } else {
        const data = (await res.json()) as HelloResponse;
        setResult(data.message != null ? [toSegment(data)] : []);
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
      const res = await fetch(`${API_BASE}/generate?${params}`);
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

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const showTooltipAt = (index: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTooltip({ index, left: rect.left + rect.width / 2, top: rect.top });
  };

  const lookupDefinition = async (token: string, kind: "ko" | "hanja") => {
    if (!token.trim()) return;
    setTooltipLoading(true);
    setTooltipDefinition(null);
    try {
      const res = await fetch(
        `${API_BASE}/define?word=${encodeURIComponent(token)}&kind=${kind}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { definition?: string };
      if (data.definition) setTooltipDefinition(data.definition);
    } catch {
      // ignore errors for tooltip lookup
    } finally {
      setTooltipLoading(false);
    }
  };

  const hanjaCount = result.filter((s) => s.pinyin).length;
  const loanwordCount = result.filter((s) => s.original && !s.pinyin).length;
  const temperatureFill = `${((temperature - 0.1) / 0.9) * 100}%`;
  const cardBodyHeight = "h-[clamp(13rem,34vh,22rem)] lg:h-[clamp(16rem,44vh,28rem)]";

  const activeTooltipSegment = tooltip != null ? result[tooltip.index] : null;

  return (
    <div
      className="relative min-h-dvh text-zinc-200"
      onClick={() => {
        setTooltip(null);
        setTooltipDefinition(null);
      }}
    >
      {/* Navbar */}
      <header className="navbar fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-linear-to-br from-violet-500 via-fuchsia-500 to-pink-500 font-korean text-[15px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(192,38,211,0.55)] transition-transform duration-200 group-hover:scale-105">
              한
            </span>
            <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
              Hangugnese
            </span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHelpModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              <HelpIcon className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">How it works</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex min-h-dvh flex-col lg:flex-row">
        {/* Input panel */}
        <section className="panel-input flex min-w-0 flex-1 px-5 pb-12 pt-[calc(var(--nav-height)+1.25rem)] sm:px-8 lg:px-12 lg:pb-16 lg:pt-[calc(var(--nav-height)+2rem)] xl:px-16">
          <div className="mx-auto w-full max-w-xl">
            <div className="collapse-grid" data-open={!generateSectionOpen}>
              <div
                className={`overflow-hidden transition-opacity duration-200 ${
                  generateSectionOpen ? "opacity-0" : "opacity-100"
                }`}
                inert={generateSectionOpen}
              >
                <div className="pb-8">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    01 — English
                  </p>
                  <h1 className="mt-3 font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.035em] text-white sm:text-[2.5rem] xl:text-[3rem]">
                    Forge a Verse
                  </h1>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-400">
                    Write anything in English, or let AI draft a passage for you
                    to translate.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#23272c]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_48px_-24px_rgba(0,0,0,0.7)] transition-[border-color,box-shadow] duration-200 focus-within:border-white/20 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_4px_rgba(167,139,250,0.08),0_24px_48px_-24px_rgba(0,0,0,0.7)]">
                {/* Card header */}
                <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
                  <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    English
                  </span>
                  <button
                    type="button"
                    onClick={() => setGenerateSectionOpen((o) => !o)}
                    aria-expanded={generateSectionOpen}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 ${
                      generateSectionOpen
                        ? "bg-violet-500/15 text-violet-200"
                        : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <SparkIcon className="h-3.5 w-3.5" />
                    Draft with AI
                    <ChevronIcon
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${
                        generateSectionOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Draft with AI */}
                <div className="collapse-grid" data-open={generateSectionOpen}>
                  <div className="overflow-hidden" inert={!generateSectionOpen}>
                    <div className="space-y-4 border-b border-white/[0.06] bg-black/10 px-4 py-4">
                      <div>
                        <label
                          htmlFor="generate-prompt"
                          className="mb-1.5 block text-xs font-medium text-zinc-400"
                        >
                          Topic <span className="text-zinc-500">(optional)</span>
                        </label>
                        <input
                          id="generate-prompt"
                          type="text"
                          value={generatePrompt}
                          onChange={(e) => setGeneratePrompt(e.target.value)}
                          placeholder="e.g. Harry Potter teams up with Voldemort"
                          className="h-10 w-full rounded-lg border border-white/10 bg-[#1b1e22] px-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-violet-400/60 focus:outline-none"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                            Verbosity
                          </span>
                          <div
                            role="radiogroup"
                            aria-label="Verbosity"
                            className="grid h-10 grid-cols-3 gap-1 rounded-lg border border-white/10 bg-[#1b1e22] p-1"
                          >
                            {(["modest", "adequate", "rich"] as const).map(
                              (v) => (
                                <button
                                  key={v}
                                  type="button"
                                  role="radio"
                                  aria-checked={verbosity === v}
                                  onClick={() => setVerbosity(v)}
                                  className={`rounded-md text-xs font-medium capitalize transition-colors ${
                                    verbosity === v
                                      ? "bg-white/[0.12] text-white shadow-sm"
                                      : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {v}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-400">
                            <label htmlFor="generate-temperature">
                              Creativity
                            </label>
                            <span className="font-mono text-zinc-300">
                              {temperature.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex h-10 items-center">
                            <input
                              id="generate-temperature"
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.1}
                              value={temperature}
                              onChange={(e) =>
                                setTemperature(Number(e.target.value))
                              }
                              className="range-input"
                              style={
                                { "--range-fill": temperatureFill } as CSSProperties
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={generateLoading}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.1] px-3.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {generateLoading ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <SparkIcon className="h-3.5 w-3.5" />
                        )}
                        {generateLoading ? "Drafting…" : "Generate draft"}
                      </button>
                    </div>
                  </div>
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Type or paste English text…"
                  className={`${cardBodyHeight} block w-full resize-none bg-transparent px-5 py-4 text-base leading-[1.7] text-zinc-100 placeholder:text-zinc-500 focus:outline-none`}
                />

                {/* Card footer */}
                <div className="flex h-16 items-center justify-between gap-3 border-t border-white/[0.06] px-4">
                  <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
                    <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      ⌘
                    </kbd>
                    <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      Enter
                    </kbd>
                    to translate
                  </span>
                  <span className="font-mono text-xs text-zinc-500 sm:hidden">
                    {text.length} chars
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="hidden font-mono text-xs text-zinc-500 sm:inline">
                      {text.length}
                    </span>
                    <button
                      type="submit"
                      disabled={loading || !text.trim()}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(192,38,211,0.6)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
                    >
                      {loading ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <ArrowIcon className="h-4 w-4" />
                      )}
                      {loading ? "Translating…" : "Translate"}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {error}
                </div>
              )}
            </form>
          </div>
        </section>

        <div
          aria-hidden
          className="hidden w-px shrink-0 bg-linear-to-b from-transparent via-violet-400/40 to-transparent lg:block"
        />

        {/* Output panel */}
        <section className="panel-output flex min-w-0 flex-1 px-5 pb-16 pt-12 sm:px-8 lg:px-12 lg:pb-16 lg:pt-[calc(var(--nav-height)+2rem)] xl:px-16">
          <div className="mx-auto w-full max-w-xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200/60">
              02 — Korean
            </p>
            <h2 className="mt-3 font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.035em] text-white sm:text-[2.5rem] xl:text-[3rem]">
              Reap the Jamo
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-violet-100/70">
              Hover glowing words to reveal their roots. Click any word for its
              English meaning.
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#1a1640]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_48px_-24px_rgba(15,10,40,0.8)] backdrop-blur-md">
              {/* Card header */}
              <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
                <span className="flex items-center gap-2 text-xs font-medium text-violet-100/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
                  한국어
                </span>
                <div className="flex items-center gap-3 text-xs text-violet-100/70">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
                    Hanja
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    Loanword
                  </span>
                </div>
              </div>

              <div
                className={`${cardBodyHeight} overflow-auto px-5 py-4`}
                onScroll={() => setTooltip(null)}
              >
                {result.length > 0 && !error && (
                  <p className="m-0 font-korean text-lg leading-[1.9] text-white sm:text-xl">
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
                          className={`result-segment-with-pinyin result-segment-stream-in result-hoverable-token ${auraClass}`.trim()}
                          onMouseEnter={(e) => {
                            showTooltipAt(i, e.currentTarget);
                            setTooltipDefinition(null);
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          onClick={
                            isHanja
                              ? (e) => {
                                  e.stopPropagation();
                                  lookupDefinition(seg.message, "hanja");
                                }
                              : undefined
                          }
                        >
                          {seg.message}
                        </span>
                      ) : (
                        <span
                          key={i}
                          className="result-segment-stream-in result-hoverable-token"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!seg.message.trim()) return;
                            showTooltipAt(i, e.currentTarget);
                            lookupDefinition(seg.message, "ko");
                          }}
                        >
                          {seg.message}
                        </span>
                      );
                    })}
                  </p>
                )}

                {result.length === 0 && loading && !error && (
                  <div className="space-y-3 pt-1" aria-label="Translating">
                    <div className="h-4 w-11/12 animate-pulse rounded-full bg-white/10" />
                    <div className="h-4 w-9/12 animate-pulse rounded-full bg-white/10 [animation-delay:150ms]" />
                    <div className="h-4 w-10/12 animate-pulse rounded-full bg-white/10 [animation-delay:300ms]" />
                  </div>
                )}

                {result.length === 0 && !loading && !error && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] font-korean text-xl text-violet-100/80">
                      자
                    </span>
                    <p className="mt-4 text-sm font-medium text-violet-100/80">
                      Your translation will appear here
                    </p>
                    <p className="mt-1 text-xs text-violet-100/50">
                      Hanja and loanwords light up as they stream in.
                    </p>
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div className="flex h-16 items-center justify-between gap-3 border-t border-white/[0.08] px-4 text-xs text-violet-100/60">
                <span>
                  {result.length > 0 ? (
                    <>
                      <span className="font-mono text-violet-100/90">
                        {hanjaCount}
                      </span>{" "}
                      hanja ·{" "}
                      <span className="font-mono text-violet-100/90">
                        {loanwordCount}
                      </span>{" "}
                      loanword{loanwordCount === 1 ? "" : "s"}
                    </>
                  ) : (
                    "Nothing translated yet"
                  )}
                </span>
                {loading && (
                  <span className="flex items-center gap-2 text-violet-100/80">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-400" />
                    </span>
                    Streaming
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {tooltip != null &&
        activeTooltipSegment &&
        (activeTooltipSegment.original ||
          activeTooltipSegment.pinyin ||
          tooltipLoading ||
          tooltipDefinition) &&
        createPortal(
          <div
            className="result-pinyin-tooltip result-pinyin-tooltip-portal"
            style={{
              position: "fixed",
              left: tooltip.left,
              top: tooltip.top,
              transform: "translate(-50%, -100%) translateY(-8px)",
            }}
            aria-hidden
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {activeTooltipSegment.original ? (
              <span className="result-tooltip-original">
                {activeTooltipSegment.original}
              </span>
            ) : null}
            {activeTooltipSegment.pinyin ? (
              <span className="result-tooltip-pinyin">
                {activeTooltipSegment.pinyin}
              </span>
            ) : null}
            {tooltipLoading ? (
              <span className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                <Spinner className="h-3 w-3" />
                Looking up meaning…
              </span>
            ) : tooltipDefinition ? (
              <span className="mt-1 block text-[13px] text-zinc-100">
                {tooltipDefinition}
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
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6"
            onClick={() => setHelpModalOpen(false)}
          >
            <div
              className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 bg-[#14131f]/95 p-6 text-zinc-200 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)] sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-violet-300/70">
                    Guide
                  </p>
                  <h3
                    id="help-modal-title"
                    className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-white"
                  >
                    How it works
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setHelpModalOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <ol className="mt-6 space-y-5">
                {[
                  {
                    title: "Translate",
                    body: "Type or paste English on the left and hit Translate. The Korean streams in on the right.",
                  },
                  {
                    title: "Draft with AI",
                    body: "Open “Draft with AI”, pick a topic, verbosity and creativity, then generate a passage to translate.",
                  },
                  {
                    title: "Explore the result",
                    body: "Yellow-glowing words are hanja and red-glowing words are loanwords. Hover them for the original Korean and pinyin, and click any word to see its English meaning.",
                  },
                ].map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-linear-to-br from-violet-500/30 to-fuchsia-500/30 font-mono text-xs font-semibold text-violet-100">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-display text-[15px] font-semibold text-white">
                        {step.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

type IconProps = { className?: string };

function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ArrowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function HelpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Spinner({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ""}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}
