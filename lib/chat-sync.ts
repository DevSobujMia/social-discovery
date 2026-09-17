/**
 * Same-origin live chat ping (tabs + simulator iframe).
 * Admin reply and customer send notify the other side immediately;
 * polling remains the fallback for two different browsers.
 */

export const CHAT_SYNC_CHANNEL = 'heartlink-chat-sync';

export type ChatSyncEvent = {
  type: 'conversation_updated';
  conversationId: string;
  preview?: string | null;
  source?: 'staff' | 'customer';
};

export function publishChatSync(event: ChatSyncEvent) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const bc = new BroadcastChannel(CHAT_SYNC_CHANNEL);
    bc.postMessage(event);
    bc.close();
  } catch {
    // Unsupported environment — polling still covers delivery.
  }
}

export function subscribeChatSync(handler: (event: ChatSyncEvent) => void) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }
  try {
    const bc = new BroadcastChannel(CHAT_SYNC_CHANNEL);
    const onMsg = (e: MessageEvent<ChatSyncEvent>) => {
      if (e.data?.type === 'conversation_updated' && e.data.conversationId) {
        handler(e.data);
      }
    };
    bc.addEventListener('message', onMsg);
    return () => {
      bc.removeEventListener('message', onMsg);
      bc.close();
    };
  } catch {
    return () => {};
  }
}
