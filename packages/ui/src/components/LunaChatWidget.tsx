"use client";

import { useChat } from "ai/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { Message } from "ai";
import { ChatMessage } from "./ChatMessage";

function getOrCreateSessionId(): string {
  try {
    const stored = localStorage.getItem("luna_chat_session_id");
    if (stored) return stored;
    const id = `luna-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("luna_chat_session_id", id);
    return id;
  } catch {
    return `luna-${Date.now()}`;
  }
}

type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
  hiddenPaths?: string[]; // exact-match pathnames where the widget renders nothing; default ["/chat"]
  hiddenPrefixes?: string[]; // hide when pathname starts with any prefix; default none
  agentType?: string; // if set, load persisted history from /api/ai-history on mount
};

export function LunaChatWidget({ apiPath, title, greeting, hiddenPaths, hiddenPrefixes, agentType }: LunaChatWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const sessionIdRef = useRef<string | null>(null);
  if (typeof window !== "undefined" && sessionIdRef.current === null) {
    sessionIdRef.current = getOrCreateSessionId();
  }

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: apiPath,
    id: sessionIdRef.current ?? undefined,
  });

  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (!agentType || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetch(`/api/ai-history?agentType=${encodeURIComponent(agentType)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (Array.isArray(d.messages) && d.messages.length > 0) setMessages(d.messages);
      })
      .catch(() => {});
  }, [agentType, setMessages]);

  // Smart scroll: only scroll to bottom if user is already near the bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Hide on configured paths (default: the full chat page) — after all hooks
  if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;
  if ((hiddenPrefixes ?? []).some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-sand bg-ivory shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-ink px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-gold text-lg">◑</span>
              <span className="font-sans text-body-md font-semibold text-ivory">{title ?? "Luna Stylist"}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ivory/60 hover:text-ivory"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="text-center text-body-sm text-mist pt-8">
                <p className="text-gold text-2xl mb-2">◑</p>
                {greeting ? (
                  <p>{greeting}</p>
                ) : (
                  <>
                    <p>مرحباً! I'm Luna.</p>
                    <p className="mt-1">Tell me your occasion and I'll find your perfect abaya.</p>
                  </>
                )}
              </div>
            )}
            {messages.map((m: Message) => (
              <ChatMessage key={m.id} role={m.role as "user" | "assistant"} content={m.content} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-sand px-4 py-3 text-body-sm text-mist">
                  Luna is thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-coral/10 px-4 py-3 text-body-sm text-coral">
                  Something went wrong. Please try again.
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-sand p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask Luna anything…"
                className="flex-1 rounded-full border border-sand bg-white px-4 py-2 text-body-md text-ink placeholder:text-mist focus:outline-none focus:ring-1 focus:ring-gold"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory disabled:opacity-40"
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 items-center gap-2 rounded-full bg-ink px-5 shadow-lg hover:bg-ink/90 transition-colors"
        aria-label="Open Luna assistant"
      >
        <span className="text-gold text-2xl">◑</span>
        {!open && <span className="text-ivory text-body-sm font-medium">{title ?? "Ask Luna"}</span>}
      </button>
    </div>
  );
}
