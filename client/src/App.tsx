import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DynamicUI, type UINode } from "./DynamicUI";
import { tryParsePartialJson } from "@/lib/partialJson";

// const SERVER_URL = "http://localhost:3000/api/chat";
const SERVER_URL = "https://moss-hacktoberfest-26-server.bittere.workers.dev";
const STORAGE_KEY_WIDGETS = "app_cached_widgets_v1";
const STORAGE_KEY_CONVO = "app_cached_conversation_id";

interface WidgetItem {
  id: string;
  tree: UINode | null;
  isStreaming: boolean;
}

// -------------------------------------------------------------
// 1. Custom Compact Prompt Input
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

  // Initialize widgets from localStorage
  const [widgets, setWidgets] = useState<WidgetItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WIDGETS);
      if (!saved) return [];
      const parsed: WidgetItem[] = JSON.parse(saved);
      return parsed
        .filter((w) => w && w.tree)
        .map((w) => ({ ...w, isStreaming: false }));
    } catch {
      return [];
    }
  });

  const [conversationId, setConversationId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem(STORAGE_KEY_CONVO) || undefined;
  });

  const carouselRef = useRef<HTMLDivElement>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      const toSave = widgets
        .filter((w) => w.tree !== null)
        .map((w) => ({ ...w, isStreaming: false }));
      localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(toSave));
    } catch (err) {
      console.error("Failed to cache widgets:", err);
    }
  }, [widgets]);

  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(STORAGE_KEY_CONVO, conversationId);
    } else {
      localStorage.removeItem(STORAGE_KEY_CONVO);
    }
  }, [conversationId]);

  // Auto-scroll triggers ONLY when there are more than 4 widgets
  useEffect(() => {
    if (carouselRef.current && widgets.length > 4) {
      carouselRef.current.scrollTo({
        left: carouselRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [widgets.length]);

  const handleClearAll = () => {
    setWidgets([]);
    setConversationId(undefined);
    localStorage.removeItem(STORAGE_KEY_WIDGETS);
    localStorage.removeItem(STORAGE_KEY_CONVO);
  };

  const handleSubmit = async (overridePrompt?: string) => {
    const prompt = (overridePrompt || value).trim();
    if (!prompt || isLoading) return;

    setIsLoading(true);
    if (!overridePrompt) setValue("");

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

  const handleAction = (actionId?: string, statePayload?: Record<string, any>) => {
    if (!actionId) return;

    const hasState = statePayload && Object.keys(statePayload).length > 0;
    const stateStr = hasState ? ` State: ${JSON.stringify(statePayload)}` : "";

    console.log(`[Widget Action] ${actionId}${stateStr}`);

    const followUpPrompt = `Action triggered: "${actionId}".${hasState ? ` Current widget state: ${JSON.stringify(statePayload)}.` : ""
      }`;

    handleSubmit(followUpPrompt);
  };

  const hasWidgets = widgets.length > 0;
  const isScrollable = widgets.length > 4;

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground relative flex flex-col">
      {/* ========================================================
          0. TOP ACTIONS (Clear All Widgets)
         ======================================================== */}
      <AnimatePresence>
        {hasWidgets && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 right-5 z-40"
          >
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-md text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all shadow-sm"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear widgets
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          1. WIDGETS TILING CANVAS
          - Stretches full container height
          - Content-driven widths (no forced 50% width)
          - 1-4 widgets: Centered across the screen without scroll
          - 5+ widgets: Horizontal runway with scrolling
         ======================================================== */}
      {hasWidgets && (
        <div
          ref={carouselRef}
          className={`flex-1 w-full px-6 pt-5 pb-28 [scrollbar-gutter:stable] ${isScrollable ? "overflow-x-auto overflow-y-hidden" : "overflow-x-hidden overflow-y-hidden"
            }`}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "hsl(var(--muted-foreground) / 0.3) transparent",
          }}
        >
          <motion.div
            layout
            className={`h-full flex items-stretch gap-5 transition-all ${isScrollable ? "min-w-max justify-start" : "w-full justify-center"
              }`}
          >
            <AnimatePresence mode="popLayout">
              {widgets.map((widget) => (
                <motion.div
                  key={widget.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.25 },
                  }}
                  // Content-driven sizing: scales dynamically between 280px and 640px based on content
                  className="w-auto min-w-[280px] max-w-[640px] h-full flex flex-col shrink-0 rounded-2xl border border-border/50 bg-card/75 p-6 shadow-xl backdrop-blur-md arc-theme"
                  data-theme="dark"
                >
                  <div
                    className="flex-1 w-full overflow-y-auto pr-1 flex flex-col"
                    style={{
                      scrollbarWidth: "thin",
                      scrollbarColor: "hsl(var(--muted-foreground) / 0.2) transparent",
                    }}
                  >
                    {widget.tree ? (
                      <DynamicUI node={widget.tree} onAction={handleAction} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center min-h-[220px]">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* ========================================================
          2. COMPACT PROMPT INPUT
         ======================================================== */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${hasWidgets ? "bottom-5" : "top-1/2 -translate-y-1/2"
          }`}
      >
        <div className="w-full max-w-xl pointer-events-auto">
          <CustomComposer
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onSend={() => handleSubmit()}
            isLoading={isLoading}
            placeholder={
              hasWidgets
                ? "Ask to generate another widget..."
                : "What widget would you like to create?"
            }
          />
        </div>
      </motion.div>
    </main>
  );
}