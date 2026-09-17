/**
 * Client-side thread merge — WhatsApp/Telegram style.
 * A slower or empty poll must never wipe messages the user already has.
 */

export type ThreadMessage = {
  id: string;
  conversationId?: string;
  content: string;
  createdAt: string | Date;
  status?: string;
  isOwn?: boolean;
  senderUserId?: string | null;
  senderStaffId?: string | null;
  [key: string]: unknown;
};

function timeOf(value: string | Date | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function mergeChatThread<T extends ThreadMessage>(
  previous: T[],
  incoming: T[],
  conversationId: string
): T[] {
  // Stale/empty snapshot: keep what we already rendered.
  if ((!incoming || incoming.length === 0) && previous.length > 0) {
    return previous;
  }

  const byId = new Map<string, T>();

  for (const message of previous) {
    if (message.id.startsWith('temp-')) continue;
    if (message.conversationId && message.conversationId !== conversationId) continue;
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    byId.set(message.id, {
      ...message,
      conversationId: message.conversationId || conversationId,
    });
  }

  const merged = [...byId.values()].sort(
    (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)
  );

  const serverContents = new Set(incoming.map((m) => m.content));
  const stillPending = previous.filter(
    (m) => m.id.startsWith('temp-') && !serverContents.has(m.content)
  );

  return stillPending.length ? [...merged, ...stillPending] : merged;
}

export function threadFingerprint<T extends { id: string; status?: string }>(
  messages: T[]
): string {
  return messages.map((m) => `${m.id}:${m.status || ''}`).join('|');
}
