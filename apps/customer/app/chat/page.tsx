import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@e-luna/db";
import { ChatInterface } from "./ChatInterface";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Luna AI Stylist",
  description: "Chat with Luna, your personal AI abaya stylist",
};

export default async function ChatPage() {
  const user = await currentUser();

  const sizeProfile = user
    ? await prisma.sizeProfile.findFirst({
        where: { customerProfile: { userId: user.id } },
        select: { usualSize: true },
      })
    : null;

  const sessionId = user ? `luna-stylist-${user.id}` : `luna-stylist-guest-${Date.now()}`;
  const userName = user?.firstName ?? null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-sand bg-ivory px-4 py-4 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-ivory text-body-sm">
              ✦
            </div>
            <div>
              <h1 className="font-display text-display-sm text-ink">Luna AI Stylist</h1>
              <p className="text-body-xs text-mist">
                {sizeProfile?.usualSize
                  ? `Personalised for size ${sizeProfile.usualSize}`
                  : "Your personal AI abaya stylist"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ChatInterface sessionId={sessionId} userName={userName} />
    </div>
  );
}
