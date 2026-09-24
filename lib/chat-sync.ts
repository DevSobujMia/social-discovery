/**
 * Same-origin live chat ping (tabs + simulator iframe).
 * Admin reply and customer send notify the other side immediately;
 * polling remains the fallback for two different browsers.
 */

export const CHAT_SYNC_CHANNEL = 'cityhost-chat-sync';
const LEGACY_CHAT_SYNC_CHANNEL = 'heartlink-chat-sync';

export type ChatSyncEvent =
  | {
      type: 'conversation_updated';
      conversationId: string;
      preview?: string | null;
      source?: 'staff' | 'customer';
    }
  | {
      type: 'typing';
      conversationId: string;
      senderName?: string | null;
      source?: 'staff' | 'customer';
    };

function publishOn(channel: string, event: ChatSyncEvent) {
  const bc = new BroadcastChannel(channel);
  bc.postMessage(event);
  bc.close();
}

export function publishChatSync(event: ChatSyncEvent) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    publishOn(CHAT_SYNC_CHANNEL, event);
    publishOn(LEGACY_CHAT_SYNC_CHANNEL, event);
  } catch {
    // Unsupported environment — polling still covers delivery.
  }
}

export function subscribeChatSync(handler: (event: ChatSyncEvent) => void) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }
  try {
    const channels = [
      new BroadcastChannel(CHAT_SYNC_CHANNEL),
      new BroadcastChannel(LEGACY_CHAT_SYNC_CHANNEL),
    ];
    const onMsg = (e: MessageEvent<ChatSyncEvent>) => {
      if (
        e.data?.conversationId &&
        (e.data.type === 'conversation_updated' || e.data.type === 'typing')
      ) {
        handler(e.data);
      }
    };
    for (const bc of channels) bc.addEventListener('message', onMsg);
    return () => {
      for (const bc of channels) {
        bc.removeEventListener('message', onMsg);
        bc.close();
      }
    };
  } catch {
    return () => {};
  }
}
