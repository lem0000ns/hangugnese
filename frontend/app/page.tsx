"use client";

import { FormEvent, useState } from "react";

type HelloResponse = {
  message: string;
};

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `http://localhost:8000/translate/${encodeURIComponent(value)}`
      );

      if (!res.ok) {
        setError(`Error from backend: ${res.status}`);
        return;
      }

      const data = (await res.json()) as HelloResponse;
      setResult(data.message);
    } catch {
      setError("Could not reach backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <main>
        <h1>Translator demo</h1>
        <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type text to translate"
            style={{ padding: "0.5rem", minWidth: "16rem" }}
          />
          <button
            type="submit"
            style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem" }}
          >
            {loading ? "Translating..." : "Translate"}
          </button>
        </form>

        {error && (
          <p style={{ marginTop: "1rem", color: "red" }}>
            {error}
          </p>
        )}

        {result && !error && (
          <p style={{ marginTop: "1rem" }}>
            Backend says: {result}
          </p>
        )}
      </main>
    </div>
  );
}
