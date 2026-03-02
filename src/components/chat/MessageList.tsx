"use client";

import { useRef, useEffect } from "react";
import type { Message, StreamStatus } from "@/lib/types";
import UserMessage from "./UserMessage";
import AssistantMessage from "./AssistantMessage";
import StreamingIndicator from "./StreamingIndicator";

interface MessageListProps {
  messages: Message[];
  streamStatus: StreamStatus;
}

export default function MessageList({ messages, streamStatus }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamStatus]);

  return (
    <div className="flex-1 overflow-y-auto py-4">
      {messages.map((msg) =>
        msg.role === "user" ? (
          <UserMessage key={msg.id} message={msg} />
        ) : (
          <AssistantMessage key={msg.id} message={msg} />
        )
      )}
      <StreamingIndicator status={streamStatus} />
      <div ref={bottomRef} />
    </div>
  );
}
