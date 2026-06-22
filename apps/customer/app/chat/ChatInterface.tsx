"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { ChatMessage } from "@e-luna/ui";

export function ChatInterface({
  sessionId,
  userName,
}: {
  sessionId: string;
  userName: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/chat",
    id: sessionId,
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: `Ahlan wa sahlan${userName ? `, ${userName}` : ""}! I'm Luna, your AI stylist. Tell me about an occasion, your style, or what you're looking for — I'll find the perfect abaya for you. ✨`,
      },
    ],
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role as "user" | "assistant"}
              content={msg.content}
            />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-mist text-body-sm">
              <span className="animate-pulse text-gold">●</span>
              <span>Luna is thinking…</span>
            </div>
          )}
          {error && (
            <p className="text-coral text-body-sm">Something went wrong. Please try again.</p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-sand bg-ivory px-4 py-4 md:px-8">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-3">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask Luna anything about abayas…"
            disabled={isLoading}
            className="flex-1 rounded-xl border border-sand bg-white px-4 py-3 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-ink px-5 py-3 text-body-sm font-medium text-ivory transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-center text-body-xs text-mist">
          Luna AI may make mistakes. Always verify sizing before purchasing.
        </p>
      </div>
    </div>
  );
}
