"use client";

import { useChat } from "ai/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { Message } from "ai";
import { ChatMessage } from "./ChatMessage";

type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in customer app
};

export function LunaChatWidget({ apiPath }: LunaChatWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: apiPath,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Hide on the full chat page — after all hooks
  if (pathname === "/chat") return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-sand bg-ivory shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-ink px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-gold text-lg">◑</span>
              <span className="font-sans text-body-md font-semibold text-ivory">Luna Stylist</span>
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
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="text-center text-body-sm text-mist pt-8">
                <p className="text-gold text-2xl mb-2">◑</p>
                <p>مرحباً! I'm Luna.</p>
                <p className="mt-1">Tell me your occasion and I'll find your perfect abaya.</p>
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
        className="flex h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg hover:bg-ink/90 transition-colors"
        aria-label="Open Luna Stylist"
      >
        <span className="text-gold text-2xl">◑</span>
      </button>
    </div>
  );
}
