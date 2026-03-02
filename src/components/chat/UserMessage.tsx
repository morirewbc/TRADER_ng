import type { Message } from "@/lib/types";

export default function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end px-4 py-3">
      <p className="max-w-[80%] text-sm text-text whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}
