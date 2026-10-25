import React, { useState, useRef, useEffect } from "react";
import { DynamicUI, type UINode } from "./DynamicUI";
import { tryParsePartialJson } from "@/lib/partialJson";

const SERVER_URL = "http://localhost:3000/api/chat";

interface WidgetItem {
  id: string;
  tree: UINode | null;
  isStreaming: boolean;
}

// -------------------------------------------------------------
// 1. Custom Compact Cult UI-styled Prompt Input
// -------------------------------------------------------------
function CustomComposer({
  value,
  onChange,
  onSend,
  isLoading,
  placeholder = "Ask anything or compose a widget...",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow height slightly up to a compact max
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative w-full rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl p-2 transition-all focus-within:border-border focus-within:ring-1 focus-within:ring-ring/50">
      <div className="flex items-center gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 max-h-[120px] min-h-[38px] resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none scrollbar-none"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. Main App
// -------------------------------------------------------------
export default function App() {
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Auto-scroll horizontally towards the right when new widgets arrive
  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.scrollTo({
        left: carouselRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [widgets.length]);

  const handleSubmit = async () => {
    const prompt = value.trim();
    if (!prompt || isLoading) return;

    setIsLoading(true);
    setValue("");

    const widgetId = crypto.randomUUID();
    setWidgets((prev) => [
      ...prev,
      { id: widgetId, tree: null, isStreaming: true },
    ]);

    try {
      const res = await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, conversationId }),
      });

      if (!res.ok || !res.body) throw new Error("Stream error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedJson = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonPayload = trimmed.replace(/^data:\s*/, "");
          try {
            const event = JSON.parse(jsonPayload);
            if (event.type === "token" && event.text) {
              accumulatedJson += event.text;

              const parsed = tryParsePartialJson(accumulatedJson);
              if (parsed && typeof parsed === "object") {
                setWidgets((prev) =>
                  prev.map((w) => (w.id === widgetId ? { ...w, tree: parsed } : w))
                );
              }
            } else if (event.type === "done" && event.conversationId) {
              setConversationId(event.conversationId);
            }
          } catch (e) {
            console.error("Parse error", e);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, isStreaming: false } : w))
      );
      setIsLoading(false);
    }
  };

  const handleAction = (actionId?: string) => {
    if (!actionId) return;
    console.log("Widget Action Triggered:", actionId);
    // Only update value if you actually want to put text into the composer
    setValue((prev) => (prev ? prev : `Action: ${actionId}`));
  };

  const hasWidgets = widgets.length > 0;

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground relative flex flex-col">
      {/* ========================================================
          1. WIDGETS CANVAS
          - Stacks vertically until viewport limit, then wraps
            horizontally to create column groups.
          - Gives horizontal and vertical scrollbars.
         ======================================================== */}
      {hasWidgets && (
        <div
          ref={carouselRef}
          className="flex-1 w-full overflow-x-auto overflow-y-hidden p-6 pb-28 [scrollbar-gutter:stable]"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "hsl(var(--muted-foreground) / 0.3) transparent",
          }}
        >
          {/* Multi-column Flex-Wrap Canvas */}
          <div className="h-full flex flex-col flex-wrap content-start gap-5 min-w-max">
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className="w-[340px] md:w-[400px] max-h-[calc(100vh-160px)] overflow-y-auto shrink-0 rounded-2xl border border-border/50 bg-card/75 p-5 shadow-lg backdrop-blur-md arc-theme" data-theme="dark"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "hsl(var(--muted-foreground) / 0.2) transparent",
                }}
              >
                {widget.tree ? (
                  <DynamicUI node={widget.tree} onAction={handleAction} />
                ) : (
                  /* Clean Minimal Spinner */
                  <div className="flex h-36 w-full items-center justify-center">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================
          2. COMPACT PROMPT INPUT
          - If widgets === 0: Centered vertically and horizontally.
          - If widgets > 0: Docked above the widgets at the bottom (floating).
         ======================================================== */}
      <div
        className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 transition-all duration-500 ease-out ${hasWidgets
          ? "bottom-5"
          : "top-1/2 -translate-y-1/2"
          }`}
      >
        <div className="w-full max-w-xl pointer-events-auto">
          <CustomComposer
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onSend={handleSubmit}
            isLoading={isLoading}
            placeholder={
              hasWidgets ? "Ask to generate another widget..." : "What widget would you like to create?"
            }
          />
        </div>
      </div>
    </main>
  );
}