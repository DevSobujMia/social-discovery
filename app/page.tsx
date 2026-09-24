'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  X,
  MessageCircle,
  User as UserIcon,
  Compass,
  Send,
  Check,
  CheckCheck,
  ShieldCheck,
  MapPin,
  Sparkles,
  ArrowRight,
  LogOut,
  ChevronLeft,
  Search,
  Plus,
  RefreshCw,
  Camera,
  AlertCircle,
  ShieldAlert,
  Phone,
  Plane,
  Trash2,
  Calendar,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import InstallPrompt from './components/InstallPrompt';
import PullToRefresh from './components/PullToRefresh';
import MatchFunnel, { type MatchProfile as FunnelMatch } from './components/MatchFunnel';
import { TrustBadges } from './components/TrustBadges';
import { PostTravelPlanModal } from '@/components/PostTravelPlanModal';
import { ImageCropperModal } from '@/components/ImageCropperModal';
import ProfileViewModal from '@/components/ProfileViewModal';
import MessageChannelModal from '@/components/MessageChannelModal';
import {
  chatBubbleTime,
  chatListTime,
  DayChip,
  dayLabel,
  isUserOnline,
  lastSeenTime,
  MessageTicks,
  sameCalendarDay,
  TypingIndicator,
} from './components/messaging';
import {
  MatchReason,
  TravelNote,
  TravelRibbon,
} from './components/TravelBadge';
import {
  collectDeviceSnapshot,
  clearExplicitLogout,
  getDeviceToken,
  inferVisitorAge,
  isExplicitLogout,
  loadAdParams,
  markExplicitLogout,
  readBrowserStore,
  removeBrowserStore,
  writeBrowserStore,
  type AdParams,
} from '@/lib/device';
import { citiesForCountry, maskPhoneLast4, PROFILE_LOCATIONS } from '@/lib/market';
import { trackPixel } from '@/lib/pixel';
import { publishChatSync, subscribeChatSync } from '@/lib/chat-sync';
import { mergeChatThread, threadFingerprint } from '@/lib/chat-thread';
import { notifyIncomingChat, setChatAppBadge } from '@/lib/chat-notify';
import HeartMark from './components/HeartMark';
import NotifyPrompt from './components/NotifyPrompt';

interface ProfilePhoto {
  id: string;
  filePath: string;
  isPrimary: boolean;
}

interface TravelInfo {
  city: string;
  country: string;
  fromDate: string;
  toDate: string;
  note: string | null;
  status: 'here-now' | 'arriving' | 'upcoming';
  daysUntil: number;
  daysLeft: number | null;
  isViewerCity: boolean;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age?: number | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  bio?: string | null;
  interests: string[];
  lookingFor?: string | null;
  relationshipIntention?: string | null;
  isVerified: boolean;
  hideContactNumber?: boolean;
  contact?: string | null;
  profileCompleteness: number;
  photos: ProfilePhoto[];
  /** Primary photo path, as returned by `GET /api/profiles`. */
  photo?: string | null;
  user?: {
    id: string;
    lastActiveAt?: string | null;
  };
  profileOwnerType?: string;
  travel?: TravelInfo | null;
  matchReason?: string | null;
}

interface ConversationItem {
  id: string;
  type: string;
  status: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  participant: {
    userId: string;
    displayName: string;
    photo: string | null;
    gender: string | null;
    unreadCount: number;
    lastActiveAt: string | null;
    isVerified?: boolean;
    travelCity?: string | null;
    country?: string | null;
  };
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderUserId?: string | null;
  senderStaffId?: string | null;
  sentOnBehalfOf?: string | null;
  senderName?: string;
  senderId?: string | null;
  isOwn?: boolean;
  content: string;
  contentType: string;
  mediaUrl?: string | null;
  status: string;
  isAssisted: boolean;
  createdAt: string;
  [key: string]: unknown;
}

type AppTab = 'discover' | 'messenger' | 'profile';

function readNavTab(): AppTab {
  const t = readBrowserStore('local', 'tab');
  if (t === 'messenger' || t === 'profile' || t === 'discover') return t;
  return 'discover';
}

function persistNavTab(tab: AppTab) {
  writeBrowserStore('local', 'tab', tab);
}

function persistChatOpen(open: boolean) {
  writeBrowserStore('local', 'chat_open', open ? '1' : '0');
}

function persistChatMeta(conv: ConversationItem) {
  if (!conv?.id || conv.id.startsWith('pending-')) return;
  writeBrowserStore('local', 'last_conv_id', conv.id);
  writeBrowserStore('local', 'last_chat', JSON.stringify(conv));
}

function persistThread(conversationId: string, messages: ChatMessage[]) {
  if (!conversationId || conversationId.startsWith('pending-')) return;
  writeBrowserStore(
    'local',
    'last_thread',
    JSON.stringify({ id: conversationId, messages: messages.slice(-80) })
  );
}

function readStoredChatMeta(): ConversationItem | null {
  try {
    const raw = readBrowserStore('local', 'last_chat');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.participant) return null;
    return parsed as ConversationItem;
  } catch {
    return null;
  }
}

function readStoredThread(): { id: string; messages: ChatMessage[] } | null {
  try {
    const raw = readBrowserStore('local', 'last_thread');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearNavPersistence() {
  removeBrowserStore('local', 'tab');
  removeBrowserStore('local', 'chat_open');
  removeBrowserStore('local', 'last_chat');
  removeBrowserStore('local', 'last_thread');
  removeBrowserStore('local', 'last_conv_id');
}

function formatMessageTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface PendingIntent {
  action: 'start_conversation' | 'like' | 'connect';
  targetUserId: string;
  profileName?: string;
  profilePhoto?: string;
}

export default function AppHome() {
  // Navigation & View state — restored from localStorage after mount (PWA refresh).
  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const [navReady, setNavReady] = useState(false);
  const initialChatOpenedRef = useRef(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Discover state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [filterGender, setFilterGender] = useState<string>('female');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterLookingFor, setFilterLookingFor] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Intent preservation for seamless ad & guest conversion
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);

  // Messenger state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [activeChat, setActiveChat] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const chatMediaInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [showTravelPlanModal, setShowTravelPlanModal] = useState(false);
  const [userTravelPlans, setUserTravelPlans] = useState<any[]>([]);
  const [hideContactNumber, setHideContactNumber] = useState<boolean>(false);
  // localStorage guest name — hydrated after mount to avoid SSR mismatch.
  const [storedGuestName, setStoredGuestName] = useState<string | null>(null);

  // Inline chat onboarding: phone verify first, then name
  const [inlineNameInput, setInlineNameInput] = useState('');
  const [inlinePhoneInput, setInlinePhoneInput] = useState('');
  const [submittingInlinePhone, setSubmittingInlinePhone] = useState(false);
  const [inlinePhoneError, setInlinePhoneError] = useState('');
  const [pendingChatOpener, setPendingChatOpener] = useState<string | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState(false);

  // Auth Modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [contactLoginInput, setContactLoginInput] = useState('');

  // 3-Option Verification Modal state (Message 3 Gatekeeper)
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<'whatsapp' | 'phone' | 'telegram'>('whatsapp');
  const [verificationValue, setVerificationValue] = useState('');
  const [verifyingContact, setVerifyingContact] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [pendingVerificationMessage, setPendingVerificationMessage] = useState<string | null>(null);


  // Quick Match / Ad Funnel Criteria Modal state (Zero Upfront Registration)
  const [showQuickMatchModal, setShowQuickMatchModal] = useState(false);
  const [quickMatchTargetProfile, setQuickMatchTargetProfile] = useState<any | null>(null);
  const [quickMatchName, setQuickMatchName] = useState('');
  const [quickMatchAge, setQuickMatchAge] = useState('25');
  const [quickMatchGender, setQuickMatchGender] = useState<'male' | 'female' | 'other'>('male');
  const [quickMatchLookingFor, setQuickMatchLookingFor] = useState('travel_partner');
  const [submittingQuickMatch, setSubmittingQuickMatch] = useState(false);

  // Ad funnel context. When the ad set already told us who it targeted we do
  // not ask the visitor to re-enter it — the prompt collapses to just a name.
  const [adParams, setAdParams] = useState<AdParams | null>(null);
  const [viewerCity, setViewerCity] = useState<string | null>(null);
  // Armed once a reply has landed OR the visitor sent a first message.
  const [replyArrived, setReplyArrived] = useState(false);
  const [firstMessageSent, setFirstMessageSent] = useState(false);
  const [replySenderName, setReplySenderName] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshingThread, setRefreshingThread] = useState(false);

  // Profile Edit state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLookingFor, setEditLookingFor] = useState('');
  const [editInterests, setEditInterests] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female' | ''>('');
  const [editAge, setEditAge] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCity, setEditCity] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Navigation & Modal Back Synchronization Refs
  const selectedProfileRef = useRef(selectedProfile);
  selectedProfileRef.current = selectedProfile;

  const showAuthModalRef = useRef(showAuthModal);
  showAuthModalRef.current = showAuthModal;

  const showVerificationModalRef = useRef(showVerificationModal);
  showVerificationModalRef.current = showVerificationModal;

  const showQuickMatchModalRef = useRef(showQuickMatchModal);
  showQuickMatchModalRef.current = showQuickMatchModal;

  const showTravelPlanModalRef = useRef(showTravelPlanModal);
  showTravelPlanModalRef.current = showTravelPlanModal;

  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;
  const messagesFpRef = useRef('');
  const threadCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const pendingBindRef = useRef<Record<string, string>>({});
  const guestStateRef = useRef<Record<string, 'inflight' | 'failed' | 'ok'>>({});
  const pendingGuestArgsRef = useRef<
    Record<
      string,
      {
        profile: FunnelMatch;
        name: string;
        opener?: string;
        location?: string;
        prefs?: { lookingForGender: 'female' | 'male' };
      }
    >
  >({});
  const queuedSendRef = useRef<
    Array<{
      pendingId: string;
      tempId: string;
      content: string;
      plain: string;
      contentType: string;
      mediaUrl: string | null;
    }>
  >([]);
  const messageFetchGenRef = useRef<Record<string, number>>({});
  const fetchMessagesRef = useRef<
    (conversationId: string, opts?: { poll?: boolean }) => Promise<void>
  >(async () => {});

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  /** Stop inbox/message polls after a 401 until the user signs in again. */
  const authDeadRef = useRef(false);
  /** Don't poll until the first /api/auth/me finishes (avoids orphan-cookie spam after DB wipe). */
  const authReadyRef = useRef(false);
  const unreadSigRef = useRef<Record<string, number>>({});
  const pendingOpenChatRef = useRef<string | null>(null);

  // Block management state
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [confirmBlockTarget, setConfirmBlockTarget] = useState<{ userId: string; displayName?: string; conversationId?: string } | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const confirmBlockTargetRef = useRef(confirmBlockTarget);
  confirmBlockTargetRef.current = confirmBlockTarget;
  const closingModalViaHistoryRef = useRef<string | null>(null);

  // 3-Option Message Channel Modal State for profile view
  const [pageChannelModalProfile, setPageChannelModalProfile] = useState<any | null>(null);
  const [showPageChannelModal, setShowPageChannelModal] = useState(false);

  // In-App Quick Reply Toast Banner State
  interface QuickReplyToastData {
    conversationId: string;
    senderName: string;
    senderPhoto?: string | null;
    preview: string;
  }
  const [activeToast, setActiveToast] = useState<QuickReplyToastData | null>(null);
  const [toastReplying, setToastReplying] = useState(false);
  const [toastReplyText, setToastReplyText] = useState('');
  const [toastSending, setToastSending] = useState(false);
  const [toastSent, setToastSent] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showQuickReplyToast = useCallback((toast: QuickReplyToastData) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    setActiveToast(toast);
    setToastReplying(false);
    setToastReplyText('');
    setToastSent(false);

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 7500);
  }, []);

  // Navigation & Modal Handlers with Browser Back Sync
  const handleOpenProfile = (profile: Profile) => {
    setSelectedProfile(profile);
    trackPixel('ViewContent', {
      content_name: profile.displayName,
      content_ids: [profile.userId],
    });
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'profile', id: profile.id }, '');
    }
  };

  const handleCloseProfile = () => {
    setSelectedProfile(null);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'profile') {
      closingModalViaHistoryRef.current = 'profile';
      window.history.back();
    }
  };

  const handleOpenChatParticipantProfile = async (
    participant?: ConversationItem['participant'] | null
  ) => {
    if (!participant || !participant.userId) return;

    // 1. Try to find the participant in locally loaded explore profiles
    const matched = profiles.find((p) => p.userId === participant.userId);

    const fallbackPhoto =
      participant.photo ||
      matched?.photo ||
      matched?.photos?.[0]?.filePath ||
      (matched?.photos?.[0] as any)?.url ||
      null;

    const initialProfile: Profile = matched
      ? {
          ...matched,
          photo: fallbackPhoto,
          displayName: participant.displayName || matched.displayName,
          isVerified: matched.isVerified || Boolean(participant.isVerified),
          travel:
            matched.travel ||
            (participant.travelCity
              ? {
                  city: participant.travelCity,
                  country: participant.country || '',
                  fromDate: '',
                  toDate: '',
                  note: null,
                  status: 'upcoming' as const,
                  daysUntil: 0,
                  daysLeft: null,
                  isViewerCity: false,
                }
              : null),
        }
      : {
          id: participant.userId,
          userId: participant.userId,
          displayName: participant.displayName || 'User',
          photo: fallbackPhoto,
          photos: fallbackPhoto
            ? [
                {
                  id: 'p0',
                  filePath: fallbackPhoto,
                  url: fallbackPhoto,
                  isPrimary: true,
                } as any,
              ]
            : [],
          isVerified: Boolean(participant.isVerified),
          travel: participant.travelCity
            ? {
                city: participant.travelCity,
                country: participant.country || '',
                fromDate: '',
                toDate: '',
                note: null,
                status: 'upcoming' as const,
                daysUntil: 0,
                daysLeft: null,
                isViewerCity: false,
              }
            : null,
          city: participant.travelCity || participant.country || undefined,
          country: participant.country || undefined,
          gender: participant.gender || undefined,
          interests: [],
          profileCompleteness: 100,
        };

    // Open immediately with available details so user experiences zero delay
    handleOpenProfile(initialProfile);

    // 2. Fetch full profile details asynchronously to load bio, all photos, age, travel details etc.
    try {
      const res = await fetch(`/api/profiles/${participant.userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const detail = data.data;
          setSelectedProfile((prev) => {
            if (!prev || prev.userId !== participant.userId) return prev;
            return {
              ...prev,
              ...detail,
              photo:
                detail.photo ||
                prev.photo ||
                detail.photos?.[0]?.filePath ||
                detail.photos?.[0]?.url ||
                fallbackPhoto,
              photos:
                Array.isArray(detail.photos) && detail.photos.length > 0
                  ? detail.photos
                  : prev.photos,
            };
          });
        }
      }
    } catch {
      // Non-critical background fetch error
    }
  };

  const savePendingIntent = (intent: PendingIntent | null) => {
    setPendingIntent(intent);
    try {
      if (intent) {
        writeBrowserStore('session', 'intent', JSON.stringify(intent));
      } else {
        removeBrowserStore('session', 'intent');
      }
    } catch {
      // ignore
    }
  };

  const handleOpenAuthModal = (_mode: 'login' | 'signup' | 'contact_login' = 'contact_login') => {
    setAuthError('');
    setShowAuthModal(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'auth' }, '');
    }
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
    savePendingIntent(null);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'auth') {
      closingModalViaHistoryRef.current = 'auth';
      window.history.back();
    }
  };

  const handleSelectChat = (conv: ConversationItem) => {
    const switching = activeChatRef.current?.id !== conv.id;
    setActiveChat(conv);
    if (switching) {
      const cached = threadCacheRef.current[conv.id];
      setMessages(cached && cached.length ? cached : []);
      messagesFpRef.current = cached?.length
        ? threadFingerprint(cached)
        : '';
    }
    setPeerTyping(false);
    stickToBottomRef.current = true;
    persistChatOpen(true);
    persistChatMeta(conv);
    persistNavTab('messenger');
    try {
      writeBrowserStore('local', 'has_chatted', 'true');
    } catch {}
    // Clear badge instantly — server mark-read runs on GET messages.
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conv.id
          ? { ...c, participant: { ...c.participant, unreadCount: 0 } }
          : c
      )
    );
    if (typeof window !== 'undefined') {
      window.history.pushState({ chat: conv.id, tab: 'messenger' }, '');
    }
    setTimeout(() => {
      chatTextareaRef.current?.focus();
    }, 60);
  };

  const handleCloseChat = () => {
    setActiveChat(null);
    setConversations((prev) => prev.filter((c) => !c.id.startsWith('pending-')));
    persistChatOpen(false);
    persistNavTab('messenger');
    if (typeof window !== 'undefined' && window.history.state?.chat) {
      window.history.back();
    }
  };

  const handleSwitchTab = (tab: AppTab) => {
    persistNavTab(tab);
    persistChatOpen(false);
    setActiveChat(null);
    if (tab === 'messenger') {
      fetchConversations();
    }
    if (tab === 'profile' && !currentUserRef.current && !isExplicitLogout()) {
      void ensureGuestSession();
    }
    if (tab === activeTabRef.current) return;
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.pushState({ tab }, '');
    }
  };

  // Auto-focus chat input whenever chat thread opens or unlocks
  useEffect(() => {
    if (activeChat) {
      const timer = setTimeout(() => {
        chatTextareaRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [activeChat?.id, chatUnlocked, currentUser?.phone, currentUser?.isVerifiedLead]);

  // Handle Browser Back / Mobile Hardware Back
  useEffect(() => {
    const openVerify = () => setShowVerificationModal(true);
    window.addEventListener('cityhost:open-verify', openVerify);
    window.addEventListener('heartlink:open-verify', openVerify);
    return () => {
      window.removeEventListener('cityhost:open-verify', openVerify);
      window.removeEventListener('heartlink:open-verify', openVerify);
    };
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If a modal was just closed explicitly via back(), don't cascade close active chat
      if (closingModalViaHistoryRef.current) {
        closingModalViaHistoryRef.current = null;
        return;
      }
      // 0. Close block confirmation modal
      if (confirmBlockTargetRef.current) {
        setConfirmBlockTarget(null);
        return;
      }
      // 1. Close open profile modal
      if (selectedProfileRef.current) {
        setSelectedProfile(null);
        return;
      }
      // 2. Close verification or quick match modal
      if (showVerificationModalRef.current) {
        setShowVerificationModal(false);
        return;
      }
      if (showQuickMatchModalRef.current) {
        setShowQuickMatchModal(false);
        return;
      }
      // 4. Close auth modal
      if (showAuthModalRef.current) {
        setShowAuthModal(false);
        return;
      }
      // 5. Return from active chat to conversation list (or Discover if pending)
      if (activeChatRef.current) {
        const isPending = activeChatRef.current.id.startsWith('pending-');
        const hasNoHistory = conversations.length === 0;
        setActiveChat(null);
        persistChatOpen(false);
        if (isPending || hasNoHistory) {
          setActiveTab('discover');
          persistNavTab('discover');
        } else {
          persistNavTab('messenger');
        }
        return;
      }
      // 6. If state contains tab, switch to it, otherwise return to Discover
      if (e.state?.tab) {
        setActiveTab(e.state.tab);
        persistNavTab(e.state.tab);
      } else if (activeTabRef.current !== 'discover') {
        setActiveTab('discover');
        persistNavTab('discover');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Restore last tab / open chat before paint so PWA refresh stays put.
  useLayoutEffect(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      const chatFromUrl = new URLSearchParams(window.location.search).get('chat');
      const tab =
        urlTab === 'messenger' || urlTab === 'discover' || urlTab === 'profile'
          ? urlTab
          : chatFromUrl
            ? 'messenger'
            : readNavTab();
      setActiveTab(tab);
      if (urlTab === tab || chatFromUrl) persistNavTab(tab);
      if (chatFromUrl) pendingOpenChatRef.current = chatFromUrl;
      // Do not auto-open previous chat — always display the clean conversation list first
      persistChatOpen(false);
    } catch {
      // Stay on discover if storage is unavailable.
    }
    setNavReady(true);
  }, []);

  // Handle Desktop Escape Key for all modals & open chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmBlockTargetRef.current) {
          setConfirmBlockTarget(null);
        } else if (showVerificationModalRef.current) {
          setShowVerificationModal(false);
        } else if (showQuickMatchModalRef.current) {
          setShowQuickMatchModal(false);
        } else if (selectedProfileRef.current) {
          handleCloseProfile();
        } else if (showAuthModalRef.current) {
          handleCloseAuthModal();
        } else if (activeChatRef.current) {
          handleCloseChat();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCloseChatRef = useRef(handleCloseChat);
  handleCloseChatRef.current = handleCloseChat;
  const handleSwitchTabRef = useRef(handleSwitchTab);
  handleSwitchTabRef.current = handleSwitchTab;

  // Screen swipe left/right to change pages smoothly
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore multi-touch gestures
      if (e.touches.length !== 1) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore touches on interactive inputs, controls, or horizontally scrollable containers
      if (
        target.closest(
          'input, textarea, select, button, [role="slider"], [data-no-swipe], .horizontal-scroll, .no-swipe'
        )
      ) {
        touchStartPosRef.current = null;
        return;
      }

      // Ignore when any modal or full-screen dialog is active
      if (
        selectedProfileRef.current ||
        showAuthModalRef.current ||
        showVerificationModalRef.current ||
        showQuickMatchModalRef.current ||
        showTravelPlanModalRef.current ||
        confirmBlockTargetRef.current
      ) {
        touchStartPosRef.current = null;
        return;
      }

      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartPosRef.current || e.changedTouches.length !== 1) {
        touchStartPosRef.current = null;
        return;
      }

      const start = touchStartPosRef.current;
      touchStartPosRef.current = null;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - start.x;
      const deltaY = endY - start.y;
      const deltaTime = Date.now() - start.time;

      // Thresholds: quick fluid swipe (< 500ms) and clear horizontal distance (>= 72px)
      if (deltaTime > 500 || Math.abs(deltaX) < 72) return;

      // Must be predominantly horizontal (not vertical scroll)
      if (Math.abs(deltaX) < Math.abs(deltaY) * 2.0) return;

      // 1. If currently inside an open chat on mobile, swiping right goes back to chat list
      if (activeChatRef.current) {
        if (deltaX > 48) {
          handleCloseChatRef.current();
        }
        return;
      }

      // 2. Tab switching: ['discover', 'messenger', 'profile']
      const tabs: AppTab[] = ['discover', 'messenger', 'profile'];
      const currentIdx = tabs.indexOf(activeTabRef.current);
      if (currentIdx === -1) return;

      if (deltaX < -48) {
        // Swiped LEFT -> Move to next tab
        if (currentIdx < tabs.length - 1) {
          setSlideDirection('left');
          handleSwitchTabRef.current(tabs[currentIdx + 1]);
          setTimeout(() => setSlideDirection(null), 300);
        }
      } else if (deltaX > 48) {
        // Swiped RIGHT -> Move to previous tab
        if (currentIdx > 0) {
          setSlideDirection('right');
          handleSwitchTabRef.current(tabs[currentIdx - 1]);
          setTimeout(() => setSlideDirection(null), 300);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // UTM Attribution Capture & Intent Restoration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Restore pending intent if any
      try {
        const rawIntent = readBrowserStore('session', 'intent');
        if (rawIntent) setPendingIntent(JSON.parse(rawIntent));
      } catch {
        // ignore
      }

      // What the ad set already knows about this visitor. Captured before any
      // interaction so an abandoned visit is still a usable lead.
      const ads = loadAdParams();
      setAdParams(ads);
      if (ads.city) setViewerCity(ads.city);
      if (ads.gender === 'male' || ads.gender === 'female' || ads.gender === 'other') {
        // The ad promised profiles of this gender, so filter discovery to them.
        setFilterGender(ads.gender);
      }
      const inferredAge = inferVisitorAge(ads);
      if (inferredAge) setQuickMatchAge(String(inferredAge));

      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get('utm_source');
      const utmMedium = urlParams.get('utm_medium');
      const utmCampaign = urlParams.get('utm_campaign');
      const utmContent = urlParams.get('utm_content');
      const utmTerm = urlParams.get('utm_term');

      if (utmSource || utmCampaign) {
        const utmData = {
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm,
          landingPage: window.location.href,
          referrerUrl: document.referrer || null,
        };
        try {
          writeBrowserStore('session', 'utm', JSON.stringify(utmData));
          writeBrowserStore('local', 'utm', JSON.stringify(utmData));
        } catch {
          // ignore
        }

        // Send attribution event to backend
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'ad_landing_view',
            ...utmData,
          }),
        }).catch(() => {});
        trackPixel('PageView');
      }
    }
  }, []);

  // Fetch authenticated user
  const clearGuestSession = useCallback(() => {
    authDeadRef.current = true;
    setCurrentUser(null);
    currentUserRef.current = null;
    setActiveChat(null);
    setConversations([]);
    setMessages([]);
    threadCacheRef.current = {};
    messageFetchGenRef.current = {};
    setChatUnlocked(false);
    setActiveTab('discover');
    clearNavPersistence();
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      if (!currentUserRef.current) setLoadingUser(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('cityhost_user_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/auth/me', { headers, credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.data?.user) {
        authDeadRef.current = false;
        clearExplicitLogout();
        setCurrentUser(data.data.user);
        currentUserRef.current = data.data.user;
        if (Array.isArray(data.data.user.profile?.travelPlans)) {
          setUserTravelPlans(data.data.user.profile.travelPlans);
        }
        setHideContactNumber(Boolean(data.data.user.hideContactNumber));
        setEditDisplayName(
          data.data.user.profile?.displayName &&
            data.data.user.profile.displayName !== 'Visitor'
            ? data.data.user.profile.displayName
            : ''
        );
        setEditBio(data.data.user.profile?.bio || '');
        setEditLookingFor(data.data.user.profile?.lookingFor || '');
        setEditInterests(data.data.user.profile?.interests?.join(', ') || '');
        setEditGender(
          data.data.user.profile?.gender === 'male' || data.data.user.profile?.gender === 'female'
            ? data.data.user.profile.gender
            : ''
        );
        setEditAge(data.data.user.age ? String(data.data.user.age) : '');
        setEditCountry(data.data.user.profile?.country || '');
        setEditCity(data.data.user.profile?.city || '');
        if (data.data.user.isVerifiedLead || data.data.user.phone) {
          setChatUnlocked(true);
        }
        return data.data.user;
      } else {
        // A missed /me must not close an in-progress first chat (name + number gate).
        if (currentUserRef.current || activeChatRef.current) {
          return currentUserRef.current;
        }
        authDeadRef.current = true;
        setCurrentUser(null);
        currentUserRef.current = null;
        setConversations([]);
        setMessages([]);
        threadCacheRef.current = {};
        messageFetchGenRef.current = {};
        setChatUnlocked(false);
        return null;
      }
    } catch {
      // Transient network glitch: preserve state and do not permanently disable polling
      if (currentUserRef.current || activeChatRef.current) {
        return currentUserRef.current;
      }
      return null;
    } finally {
      authReadyRef.current = true;
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    try {
      setStoredGuestName(readBrowserStore('local', 'guest_name'));
    } catch {
      setStoredGuestName(null);
    }
  }, [currentUser?.profile?.displayName]);

  // Recover the lead when the session cookie is gone but the browser still
  // holds its device token. Without this, a returning visitor who cleared
  // cookies would silently become a brand new lead and lose their chat.
  useEffect(() => {
    if (isExplicitLogout()) return;
    const token = getDeviceToken();
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/device-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceToken: token,
            device: collectDeviceSnapshot(),
          }),
        });
        const data = await res.json();
        if (cancelled || isExplicitLogout() || !data.success || !data.data?.resumed) return;

        await fetchCurrentUser();
        setActionNotice('Welcome back — your conversation is right here.');
        setTimeout(() => setActionNotice(null), 4000);
      } catch {
        // A failed resume just means they continue as a fresh visitor.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchCurrentUser]);

  // Ensure visitor has a guest profile ready for browsing, editing profile, and chatting
  const ensureGuestSession = useCallback(async () => {
    if (currentUserRef.current) return currentUserRef.current;
    if (isExplicitLogout()) return null;
    try {
      let storedUtm: any = null;
      try {
        const raw =
          readBrowserStore('session', 'utm') ||
          readBrowserStore('local', 'utm');
        if (raw) storedUtm = JSON.parse(raw);
      } catch {}

      const guestName = readBrowserStore('local', 'guest_name') || 'Visitor';

      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: guestName,
          utm: storedUtm,
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
          adCity: adParams?.city || undefined,
          adCountry: adParams?.country || undefined,
        }),
      });

      const data = await res.json();
      if (typeof window !== 'undefined' && data.data?.token) {
        localStorage.setItem('cityhost_user_token', data.data.token);
      }
      if (data.success) {
        authDeadRef.current = false;
        authReadyRef.current = true;
        return await fetchCurrentUser();
      }
    } catch (err) {
      console.error('Failed to auto-create guest session:', err);
    }
    return null;
  }, [adParams, fetchCurrentUser]);

  useEffect(() => {
    if (activeTab === 'profile' && !currentUser && !loadingUser && !isExplicitLogout()) {
      ensureGuestSession();
    }
  }, [activeTab, currentUser, loadingUser, ensureGuestSession]);

  // Fetch blocked users
  const fetchBlockedUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/block');
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.blockedUserIds)) {
        setBlockedUserIds(data.data.blockedUserIds);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchBlockedUsers();
    } else {
      setBlockedUserIds([]);
    }
  }, [currentUser, fetchBlockedUsers]);

  // Fetch discover profiles
  const fetchProfiles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterGender) params.set('gender', filterGender);
      if (filterLookingFor) params.set('lookingFor', filterLookingFor);
      const city = filterCountry || adParams?.city;
      if (city) params.set('city', city);
      if (adParams?.country) params.set('geoCountry', adParams.country);

      const res = await fetch(`/api/profiles?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.profiles)) {
        setProfiles(data.data.profiles);
        if (data.data.viewer?.city) setViewerCity(data.data.viewer.city);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }, [filterGender, filterCountry, filterLookingFor, adParams]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Fetch conversations
  const sortConversations = useCallback((list: ConversationItem[]) => {
    const timeOf = (c: ConversationItem) => {
      const raw = c.lastMessageAt;
      const t = raw ? new Date(raw).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    // Newest activity always first (WhatsApp / Telegram style).
    return [...list].sort((a, b) => timeOf(b) - timeOf(a));
  }, []);

  const bumpConversation = useCallback(
    (conversationId: string, preview: string) => {
      const now = new Date().toISOString();
      setConversations((prev) =>
        sortConversations(
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessageAt: now,
                  lastMessagePreview: preview,
                  participant: { ...c.participant, unreadCount: 0 },
                }
              : c
          )
        )
      );
    },
    [sortConversations]
  );

  const fetchConversations = useCallback(async (silent = false) => {
    if (!authReadyRef.current || authDeadRef.current || !currentUserRef.current) return [];
    try {
      if (!silent) setLoadingConversations(true);
      const userTok = typeof window !== 'undefined' ? localStorage.getItem('cityhost_user_token') : null;
      const headers: Record<string, string> = {};
      if (userTok) headers['Authorization'] = `Bearer ${userTok}`;

      const res = await fetch('/api/conversations', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.status === 401) {
        if (currentUserRef.current || activeChatRef.current) return [];
        clearGuestSession();
        return [];
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.conversations)) {
        const list: ConversationItem[] = data.data.conversations;
        // Only clear the badge while the thread is actually on screen.
        const viewingId =
          activeTabRef.current === 'messenger' ? activeChatRef.current?.id : null;
        const normalized = sortConversations(
          list.map((c) =>
            viewingId && c.id === viewingId
              ? { ...c, participant: { ...c.participant, unreadCount: 0 } }
              : c
          )
        );
        setConversations((prev) => {
          const open = activeChatRef.current;
          if (open && !normalized.some((c) => c.id === open.id)) {
            return sortConversations([
              open,
              ...normalized.filter((c) => !c.id.startsWith('pending-')),
            ]);
          }
          return normalized;
        });

        for (const c of normalized) {
          const unread = c.participant.unreadCount || 0;
          const prev = unreadSigRef.current[c.id];
          const viewingThis =
            activeTabRef.current === 'messenger' &&
            activeChatRef.current?.id === c.id;
          if (prev !== undefined && unread > prev && unread > 0) {
            notifyIncomingChat({
              conversationId: c.id,
              title: c.participant.displayName || 'City Host',
              body: c.lastMessagePreview || 'New message',
              viewingThisChat: viewingThis,
              icon: c.participant.photo,
              url: `/?tab=messenger&chat=${encodeURIComponent(c.id)}`,
            });
            if (!viewingThis) {
              showQuickReplyToast({
                conversationId: c.id,
                senderName: c.participant.displayName || 'Traveler',
                senderPhoto: c.participant.photo,
                preview: c.lastMessagePreview || 'New message',
              });
            }
          }
          unreadSigRef.current[c.id] = unread;
        }

        if (viewingId) {
          const open = normalized.find((c) => c.id === viewingId);
          const preview = (open?.lastMessagePreview || '').trim();
          const thread = threadCacheRef.current[viewingId] || [];
          const previewInThread = preview
            ? thread.some((m) => (m.content || '').trim() === preview)
            : true;
          if (preview && !previewInThread) {
            void fetchMessagesRef.current(viewingId);
          }
        }

        const pendingId = pendingOpenChatRef.current;
        if (pendingId) {
          const wanted = normalized.find((c) => c.id === pendingId);
          if (wanted) {
            pendingOpenChatRef.current = null;
            setActiveChat(wanted);
            persistChatOpen(true);
            persistChatMeta(wanted);
            persistNavTab('messenger');
            setActiveTab('messenger');
          }
        }

        return normalized;
      }
      return [];
    } catch {
      // Quiet: cold compile / brief network blips during `npm run dev` are expected.
      return [];
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }, [sortConversations, clearGuestSession]);

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  const handleOpenChatFromToast = useCallback((conversationId: string) => {
    setActiveToast(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    persistNavTab('messenger');
    setActiveTab('messenger');
    setConversations((prev) => {
      const found = prev.find((c) => c.id === conversationId);
      if (found) {
        handleSelectChat(found);
      } else {
        pendingOpenChatRef.current = conversationId;
        void fetchConversationsRef.current(true);
      }
      return prev;
    });
  }, [handleSelectChat]);

  const handleSendToastQuickReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToast || !toastReplyText.trim() || toastSending) return;
    const conversationId = activeToast.conversationId;
    const text = toastReplyText.trim();
    setToastSending(true);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ content: text }),
      });
      bumpConversation(conversationId, text);
      publishChatSync({
        type: 'conversation_updated',
        conversationId,
        preview: text,
        source: 'customer',
      });
      setToastSent(true);
      setToastReplyText('');
      setTimeout(() => {
        setActiveToast(null);
        setToastSending(false);
        setToastSent(false);
      }, 1500);
      void fetchConversationsRef.current(true);
      if (activeChatRef.current?.id === conversationId) {
        void fetchMessagesRef.current(conversationId);
      }
    } catch {
      setToastSending(false);
    }
  };

  // Fetch messages for active chat
  const fetchMessages = useCallback(async (
    conversationId: string,
    opts?: { poll?: boolean }
  ) => {
    if (!authReadyRef.current || authDeadRef.current || !currentUserRef.current) return;
    const gen = (messageFetchGenRef.current[conversationId] || 0) + 1;
    messageFetchGenRef.current[conversationId] = gen;
    try {
      const limit = opts?.poll ? 40 : 300;
      const poll = opts?.poll ? '&poll=1' : '';
      const userTok = typeof window !== 'undefined' ? localStorage.getItem('cityhost_user_token') : null;
      const headers: Record<string, string> = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
      if (userTok) headers['Authorization'] = `Bearer ${userTok}`;

      const res = await fetch(
        `/api/conversations/${conversationId}/messages?limit=${limit}${poll}&ts=${Date.now()}`,
        {
          credentials: 'include',
          cache: 'no-store',
          headers,
        }
      );
      if (messageFetchGenRef.current[conversationId] !== gen) return;
      if (res.status === 401) {
        if (currentUserRef.current || activeChatRef.current) return;
        clearGuestSession();
        return;
      }
      const data = await res.json();
      if (messageFetchGenRef.current[conversationId] !== gen) return;
      if (!data.success || !Array.isArray(data.data?.messages)) return;

      const incoming: ChatMessage[] = data.data.messages.map((m: ChatMessage) => ({
        ...m,
        conversationId: m.conversationId || conversationId,
      }));

      // An empty snapshot is a blip, never the truth — don't wipe the thread.
      if (incoming.length === 0) return;

      if (activeChatRef.current?.id !== conversationId) {
        threadCacheRef.current[conversationId] = incoming;
        return;
      }

      setMessages((prev) => {
        const next = mergeChatThread(prev, incoming, conversationId);
        threadCacheRef.current[conversationId] = next;
        persistThread(conversationId, next);
        const fp = threadFingerprint(next);
        if (fp === messagesFpRef.current && prev.length === next.length && prev.length > 0) {
          return prev;
        }
        messagesFpRef.current = fp;
        return next;
      });

      if (activeTabRef.current === 'messenger') {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, participant: { ...c.participant, unreadCount: 0 } }
              : c
          )
        );
      }

      const reply = incoming.find(
        (m) => !(m as ChatMessage & { isOwn?: boolean }).isOwn
      );
      if (reply) {
        setReplyArrived(true);
        setPeerTyping(false);
        setReplySenderName(
          (reply as ChatMessage & { senderName?: string }).senderName || null
        );
      }
    } catch {
      // Quiet during cold compile / brief disconnects.
    }
  }, [clearGuestSession]);

  fetchMessagesRef.current = fetchMessages;

  // One-shot load when opening Messenger (not a poll).
  useEffect(() => {
    if (activeTab === 'messenger' && currentUser && !authDeadRef.current) {
      fetchConversationsRef.current();
    }
  }, [activeTab, currentUser]);

  // Open Safety / Human Verification modal when requested by operator

  // Single inbox poll loop — empty deps so Fast Refresh cannot stack intervals.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        if (authReadyRef.current && !authDeadRef.current && currentUserRef.current) {
          await fetchConversationsRef.current(true);
        }
        if (!stopped) timer = setTimeout(tick, 2200);
        return;
      }
      if (
        authReadyRef.current &&
        !authDeadRef.current &&
        currentUserRef.current
      ) {
        await fetchConversationsRef.current(true);
      }
      const delay = activeTabRef.current === 'messenger' ? 1000 : 1800;
      if (!stopped) timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 400);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Single message poll loop for the open chat.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        const chatId = activeChatRef.current?.id;
        if (
          chatId &&
          activeTabRef.current === 'messenger' &&
          authReadyRef.current &&
          !authDeadRef.current &&
          currentUserRef.current
        ) {
          await fetchMessagesRef.current(chatId, { poll: true });
        }
        if (!stopped) timer = setTimeout(tick, 2000);
        return;
      }
      const chatId = activeChatRef.current?.id;
      if (
        chatId &&
        activeTabRef.current === 'messenger' &&
        authReadyRef.current &&
        !authDeadRef.current &&
        currentUserRef.current
      ) {
        await fetchMessagesRef.current(chatId, { poll: true });
      }
      if (!stopped) timer = setTimeout(tick, 550);
    };

    timer = setTimeout(tick, 400);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // When the open chat changes, fetch once immediately.
  useEffect(() => {
    if (!activeChat || authDeadRef.current) return;
    if (activeTab !== 'messenger') return;
    fetchMessagesRef.current(activeChat.id);
  }, [activeChat, currentUser, activeTab]);

  // Instant delivery when this browser's admin tab/iframe replies (and vice versa).
  useEffect(() => {
    const kick = () => {
      if (!authReadyRef.current || authDeadRef.current) return;
      if (currentUserRef.current) fetchConversationsRef.current(true);
      const chatId = activeChatRef.current?.id;
      if (
        chatId &&
        activeTabRef.current === 'messenger' &&
        currentUserRef.current
      ) {
        fetchMessagesRef.current(chatId);
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') kick();
    };

    window.addEventListener('focus', kick);
    document.addEventListener('visibilitychange', onVis);
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'cityhost:open-chat') {
        if (data.conversationId) pendingOpenChatRef.current = data.conversationId;
        persistNavTab('messenger');
        setActiveTab('messenger');
        void fetchConversationsRef.current(true);
      } else if (data.type === 'cityhost:message-sent') {
        if (data.conversationId) {
          bumpConversation(data.conversationId, data.content || '');
          void fetchConversationsRef.current(true);
          if (activeChatRef.current?.id === data.conversationId) {
            void fetchMessagesRef.current(data.conversationId);
          }
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    const unsub = subscribeChatSync((event) => {
      if (authDeadRef.current) return;
      if (event.type === 'typing') {
        const viewing =
          activeTabRef.current === 'messenger' &&
          activeChatRef.current?.id === event.conversationId;
        if (viewing && event.source === 'staff') {
          triggerPeerTyping(event.senderName || activeChatRef.current?.participant.displayName);
        }
        return;
      }
      fetchConversationsRef.current(true);
      const viewing =
        activeTabRef.current === 'messenger' &&
        activeChatRef.current?.id === event.conversationId;
      if (viewing) {
        fetchMessagesRef.current(event.conversationId);
      } else if (event.source === 'staff') {
        let peerName = 'City Host';
        let peerPhoto: string | null = null;
        setConversations((prev) => {
          const row = prev.find((c) => c.id === event.conversationId);
          peerName = row?.participant.displayName || 'City Host';
          peerPhoto = row?.participant.photo || null;
          return sortConversations(
            prev.map((c) =>
              c.id === event.conversationId
                ? {
                    ...c,
                    lastMessageAt: new Date().toISOString(),
                    lastMessagePreview: event.preview || c.lastMessagePreview,
                    participant: {
                      ...c.participant,
                      unreadCount: (c.participant.unreadCount || 0) + 1,
                    },
                  }
                : c
            )
          );
        });
        writeBrowserStore('local', 'last_conv_id', event.conversationId);
        notifyIncomingChat({
          conversationId: event.conversationId,
          title: peerName,
          body: event.preview || 'New message',
          viewingThisChat: false,
          icon: peerPhoto,
          url: `/?tab=messenger&chat=${encodeURIComponent(event.conversationId)}`,
        });
        showQuickReplyToast({
          conversationId: event.conversationId,
          senderName: peerName,
          senderPhoto: peerPhoto,
          preview: event.preview || 'New message',
        });
      }
    });

    return () => {
      window.removeEventListener('focus', kick);
      document.removeEventListener('visibilitychange', onVis);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      unsub();
    };
  }, [sortConversations]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  // Execute pending intent after successful authentication
  const executePendingIntent = async (activeIntent: PendingIntent) => {
    savePendingIntent(null);
    if (activeIntent.action === 'start_conversation') {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: activeIntent.targetUserId }),
        });
        const data = await res.json();
        if (data.success && data.data?.conversation) {
          handleSwitchTab('messenger');
          const convId = data.data.conversation.id;
          const convs = await fetchConversations();
          const found = Array.isArray(convs) ? convs.find((c: any) => c.id === convId) : null;
          if (found) {
            handleSelectChat(found);
          } else {
            const fallbackConv: ConversationItem = {
              id: convId,
              type: data.data.conversation.type || 'direct',
              status: data.data.conversation.status || 'active',
              lastMessageAt: new Date().toISOString(),
              lastMessagePreview: null,
              participant: {
                userId: activeIntent.targetUserId,
                displayName: activeIntent.profileName || 'Match',
                photo: activeIntent.profilePhoto || null,
                gender: null,
                unreadCount: 0,
                lastActiveAt: new Date().toISOString(),
                isVerified: true,
                travelCity: null,
              },
            };
            setConversations((prev) => [fallbackConv, ...prev.filter((c) => c.id !== convId)]);
            handleSelectChat(fallbackConv);
          }
          setActionNotice(`Chat ready with ${activeIntent.profileName || 'them'}. Send a message.`);
          setTimeout(() => setActionNotice(null), 4000);
        }
      } catch (err) {
        console.error('Failed to auto-execute conversation intent:', err);
      }
    } else if (activeIntent.action === 'like' || activeIntent.action === 'connect') {
      await handleStartConversation(activeIntent.targetUserId);
    }
  };

  // Start direct conversation with a profile (e.g. staff-assisted or matched)
  const handleStartConversation = async (targetUserId: string) => {
    const targetProfile = profiles.find((p) => p.userId === targetUserId) || selectedProfile;
    if (!currentUser) {
      if (targetProfile) {
        await handleMatchSayHi(targetProfile, 'Visitor');
      } else {
        handleOpenQuickMatch(null);
      }
      return;
    }
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (data.success && data.data?.conversation) {
        handleSwitchTab('messenger');
        const convs = await fetchConversations();
        if (Array.isArray(convs)) {
          const found = convs.find((c: any) => c.id === data.data.conversation.id);
          if (found) handleSelectChat(found);
        }
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  // Open Quick Match Finder
  const handleOpenQuickMatch = (targetProfile?: any) => {
    setQuickMatchTargetProfile(targetProfile || profiles[0] || null);
    setShowQuickMatchModal(true);
  };

  const restoreQueuedSend = (pendingId: string) => {
    const queued = queuedSendRef.current.filter((item) => item.pendingId === pendingId);
    if (!queued.length) return;
    queuedSendRef.current = queuedSendRef.current.filter((item) => item.pendingId !== pendingId);
    const ids = new Set(queued.map((item) => item.tempId));
    const onThisChat = activeChatRef.current?.id === pendingId;
    if (threadCacheRef.current[pendingId]) {
      threadCacheRef.current[pendingId] = threadCacheRef.current[pendingId].filter(
        (message) => !ids.has(message.id)
      );
    }
    if (!onThisChat) return;
    setMessages((prev) => prev.filter((message) => !ids.has(message.id)));
    const text = queued.map((item) => item.plain).filter(Boolean).join('\n');
    if (text) setChatInput(text);
    setActionNotice('Could not send yet. Try again.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const flushQueuedSend = async (pendingId: string, realId: string) => {
    pendingBindRef.current[pendingId] = realId;
    const queued = queuedSendRef.current.filter((item) => item.pendingId === pendingId);
    queuedSendRef.current = queuedSendRef.current.filter((item) => item.pendingId !== pendingId);
    for (const item of queued) {
      try {
        const res = await fetch(`/api/conversations/${realId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            content: item.content,
            contentType: item.contentType,
            mediaUrl: item.mediaUrl,
          }),
        });
        const data = await res.json();
        const viewing = activeChatRef.current?.id;
        const onThisChat = viewing === pendingId || viewing === realId;
        if (data.success && data.data?.message) {
          const apply = (list: ChatMessage[]) => [
            ...list.filter((message) => message.id !== item.tempId),
            data.data.message as ChatMessage,
          ];
          if (onThisChat) {
            setMessages((prev) => {
              const next = apply(prev);
              threadCacheRef.current[realId] = next;
              messagesFpRef.current = threadFingerprint(next);
              return next;
            });
          } else if (threadCacheRef.current[realId]) {
            threadCacheRef.current[realId] = apply(threadCacheRef.current[realId]);
          }
          bumpConversation(realId, item.content);
          setFirstMessageSent(true);
          setActionNotice(null);
          publishChatSync({
            type: 'conversation_updated',
            conversationId: realId,
            preview: item.content,
            source: 'customer',
          });
          try {
            writeBrowserStore('local', 'has_chatted', 'true');
            writeBrowserStore('local', 'last_conv_id', realId);
          } catch {}
        } else if (data.error?.code === 'VERIFICATION_REQUIRED' && onThisChat) {
          setMessages((prev) => prev.filter((message) => message.id !== item.tempId));
          setPendingVerificationMessage(item.plain || item.content);
          setShowVerificationModal(true);
        } else if (onThisChat) {
          setMessages((prev) => prev.filter((message) => message.id !== item.tempId));
          if (item.plain) setChatInput(item.plain);
          setActionNotice(data.error?.message || 'Could not send yet. Try again.');
          setTimeout(() => setActionNotice(null), 3000);
        }
      } catch {
        const viewing = activeChatRef.current?.id;
        if (viewing === pendingId || viewing === realId) {
          setMessages((prev) => prev.filter((message) => message.id !== item.tempId));
          if (item.plain) setChatInput(item.plain);
          setActionNotice('Could not send yet. Try again.');
          setTimeout(() => setActionNotice(null), 3000);
        }
      }
    }
  };

  /** Landing funnel: open the chat shell instantly, then bind the guest session. */
  const handleMatchSayHi = async (
    profile: FunnelMatch,
    visitorName: string,
    opener?: string,
    visitorLocation?: string,
    prefs?: { lookingForGender: 'female' | 'male' }
  ) => {
    const pendingId = `pending-${profile.userId}`;
    if (guestStateRef.current[pendingId] === 'inflight') return;
    guestStateRef.current[pendingId] = 'inflight';
    pendingGuestArgsRef.current[pendingId] = {
      profile,
      name: visitorName,
      opener,
      location: visitorLocation,
      prefs,
    };
    const alreadyHere = activeChatRef.current?.id === pendingId;
    const optimistic: ConversationItem = {
      id: pendingId,
      type: 'assisted',
      status: 'active',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: opener?.trim() || null,
      participant: {
        userId: profile.userId,
        displayName: profile.displayName,
        photo: profile.photo || profile.photos?.[0]?.filePath || null,
        gender: profile.gender || null,
        unreadCount: 0,
        lastActiveAt: new Date().toISOString(),
        isVerified: Boolean(profile.isVerified),
        travelCity: profile.travel?.city || null,
      },
    };

    persistNavTab('messenger');
    persistChatOpen(true);
    setActiveTab('messenger');
    setActiveChat(optimistic);
    if (!alreadyHere) {
      setMessages([]);
      messagesFpRef.current = '';
    }
    setConversations((prev) => {
      if (prev.some((c) => c.participant.userId === profile.userId || c.id === pendingId)) {
        return prev;
      }
      return [optimistic, ...prev];
    });
    if (opener?.trim()) setPendingChatOpener(opener.trim());
    setInlinePhoneError('');
    setInlineNameInput('');

    // Establish backend conversation immediately so visitor can chat freely without upfront blocker
    try {
      let storedUtm: any = null;
      try {
        const raw = readBrowserStore('session', 'utm') || readBrowserStore('local', 'utm');
        if (raw) storedUtm = JSON.parse(raw);
      } catch {}

      const cleanName =
        storedGuestName ||
        currentUserRef.current?.profile?.displayName ||
        `Guest #${Math.floor(1000 + Math.random() * 9000)}`;

      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          targetUserId: profile.userId,
          utm: storedUtm,
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
          adCity: visitorLocation || adParams?.city || undefined,
          adCountry: adParams?.country || undefined,
        }),
      });

      const data = await res.json();
      if (typeof window !== 'undefined' && data.data?.token) {
        localStorage.setItem('cityhost_user_token', data.data.token);
      }
      if (data.data?.user) {
        setCurrentUser(data.data.user);
        currentUserRef.current = data.data.user;
      }
      if (data.success && data.data?.conversationId) {
        guestStateRef.current[pendingId] = 'ok';
        const realId = data.data.conversationId as string;
        const convItem: ConversationItem = { ...optimistic, id: realId };
        if (threadCacheRef.current[pendingId]) {
          threadCacheRef.current[realId] = threadCacheRef.current[pendingId].map((message) =>
            message.id.startsWith('temp-') ? { ...message, conversationId: realId } : message
          );
          delete threadCacheRef.current[pendingId];
        }
        const viewing = activeChatRef.current?.id;
        const cached = threadCacheRef.current[realId];
        if ((viewing === pendingId || viewing === realId) && cached?.length) {
          messagesFpRef.current = threadFingerprint(cached);
          setMessages(cached);
        }
        authDeadRef.current = false;
        authReadyRef.current = true;
        setActiveChat((prev) =>
          prev && (prev.id === pendingId || prev.id === realId) ? convItem : prev
        );
        setConversations((prev) => {
          const mapped = prev.map((c) => (c.id === pendingId ? convItem : c));
          if (!mapped.some((c) => c.id === realId)) return [convItem, ...mapped];
          return mapped.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
        });
        persistChatMeta(convItem);
        await flushQueuedSend(pendingId, realId);
        fetchMessages(realId);
      } else {
        guestStateRef.current[pendingId] = 'failed';
        restoreQueuedSend(pendingId);
      }
    } catch {
      guestStateRef.current[pendingId] = 'failed';
      restoreQueuedSend(pendingId);
    }
  };

  const bindPendingChatToReal = (fromId: string, toId: string, preview?: string) => {
    if (!toId) return toId;
    const now = new Date().toISOString();
    const patch = (c: ConversationItem): ConversationItem => ({
      ...c,
      id: toId,
      lastMessageAt: now,
      lastMessagePreview: preview ?? c.lastMessagePreview,
    });

    if (fromId !== toId && threadCacheRef.current[fromId]) {
      const moved = (threadCacheRef.current[fromId] || []).map((m) => ({
        ...m,
        conversationId: toId,
      }));
      threadCacheRef.current[toId] = moved;
      delete threadCacheRef.current[fromId];
      persistThread(toId, moved);
      setMessages(moved);
    }

    const current = activeChatRef.current;
    if (current && (current.id === fromId || current.id === toId)) {
      const next = patch(current);
      activeChatRef.current = next;
      persistChatMeta(next);
      persistChatOpen(true);
      persistNavTab('messenger');
      setActiveChat(next);
    } else {
      setActiveChat((prev) => {
        if (!prev || (prev.id !== fromId && prev.id !== toId)) return prev;
        const next = patch(prev);
        activeChatRef.current = next;
        persistChatMeta(next);
        persistChatOpen(true);
        persistNavTab('messenger');
        return next;
      });
    }
    setConversations((prev) => {
      const mapped = prev.map((c) => (c.id === fromId ? patch(c) : c));
      if (!mapped.some((c) => c.id === toId) && activeChatRef.current) {
        mapped.unshift(patch(activeChatRef.current));
      }
      return mapped.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
    });
    return toId;
  };

  // Name + phone in one step: creates the account, lead, and first message.
  const handleInboxRegisterSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChat || submittingInlinePhone) return;

    const cleanPhone = inlinePhoneInput.trim();
    const cleanName = inlineNameInput.trim();
    if (!cleanName || cleanName.length < 2) {
      setInlinePhoneError('Please enter your name or nickname.');
      return;
    }
    if (!cleanPhone) {
      setInlinePhoneError('Please enter your mobile or WhatsApp number.');
      return;
    }

    const conversationId = activeChat.id;
    const targetUserId = activeChat.participant?.userId;

    setSubmittingInlinePhone(true);
    setInlinePhoneError('');

    try {
      try {
        writeBrowserStore('local', 'guest_name', cleanName);
        setStoredGuestName(cleanName);
      } catch {}

      const userTok = typeof window !== 'undefined' ? localStorage.getItem('cityhost_user_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userTok) headers['Authorization'] = `Bearer ${userTok}`;

      const res = await fetch('/api/auth/phone', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          conversationId,
          targetUserId,
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
          country: adParams?.country || undefined,
          city: adParams?.city || undefined,
        }),
      });
      const data = await res.json();
      if (typeof window !== 'undefined' && data.data?.token) {
        localStorage.setItem('cityhost_user_token', data.data.token);
      }
      if (data.success && (data.data?.redirect === '/admin' || data.data?.type === 'staff')) {
        clearExplicitLogout();
        window.location.href = data.data.redirect || '/admin';
        return;
      }
      if (!data.success) {
        setInlinePhoneError(data.error?.message || 'Could not verify number. Please check country code.');
        return;
      }

      const nextId =
        data.data?.conversationId ||
        (conversationId.startsWith('pending-') ? '' : conversationId);

      if (nextId && nextId !== conversationId) {
        bindPendingChatToReal(conversationId, nextId);
      }

      const nextUser = {
        ...(currentUserRef.current || {}),
        ...(data.data?.user || {}),
        displayName: cleanName,
        phone: data.data?.user?.phone || cleanPhone,
        isVerifiedLead: true,
        profile: {
          ...(currentUserRef.current?.profile || {}),
          ...(data.data?.user?.profile || {}),
          displayName: cleanName,
        },
      };

      currentUserRef.current = nextUser;
      setCurrentUser(nextUser);
      setChatUnlocked(true);
      trackPixel('Lead', { method: 'phone' });

      setInlineNameInput('');
      setInlinePhoneInput('');

      // Auto-focus the chat input textarea now that user is verified
      setTimeout(() => {
        chatTextareaRef.current?.focus();
      }, 100);

      await fetchCurrentUser();
      await fetchConversations(true);
      if (nextId) await fetchMessagesRef.current(nextId);
    } catch {
      setInlinePhoneError('Connection error. Please try again.');
    } finally {
      setSubmittingInlinePhone(false);
    }
  };

  const triggerPeerTyping = (name?: string | null) => {
    if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
    setPeerTyping(true);
    if (name) setReplySenderName(name);
    peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 3200);
  };

  // Submit Quick Match (Zero Upfront Registration Lead)
  const handleQuickMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingQuickMatch(true);
    try {
      let storedUtm: any = null;
      try {
        const raw = readBrowserStore('session', 'utm') || readBrowserStore('local', 'utm');
        if (raw) storedUtm = JSON.parse(raw);
      } catch {}

      const targetId = quickMatchTargetProfile?.userId || profiles[0]?.userId;

      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: quickMatchName.trim() || 'Visitor',
          age: quickMatchAge ? parseInt(quickMatchAge, 10) : undefined,
          gender: quickMatchGender,
          lookingFor: quickMatchLookingFor,
          targetUserId: targetId,
          utm: storedUtm,
          // Binds this browser to the lead so a cleared cookie is recoverable.
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
          adCity: adParams?.city || undefined,
          adCountry: adParams?.country || undefined,
        }),
      });

      const data = await res.json();
      if (typeof window !== 'undefined' && data.data?.token) {
        localStorage.setItem('cityhost_user_token', data.data.token);
      }
      if (data.success) {
        setShowQuickMatchModal(false);
        authDeadRef.current = false;
        authReadyRef.current = true;
        await fetchCurrentUser();
        trackPixel('Contact', { content_name: quickMatchTargetProfile?.displayName });
        const convs = await fetchConversations();

        // If conversation was created, directly open it in Messenger!
        if (data.data?.conversationId) {
          const target = quickMatchTargetProfile || profiles.find((p) => p.userId === targetId);
          const found = Array.isArray(convs) ? convs.find((c: any) => c.id === data.data.conversationId) : null;
          const convItem: ConversationItem = found || {
            id: data.data.conversationId,
            type: 'assisted',
            status: 'active',
            lastMessageAt: new Date().toISOString(),
            lastMessagePreview: null,
            participant: {
              userId: target?.userId || targetId,
              displayName: target?.displayName || 'Match',
              photo: target?.photos?.[0]?.filePath || null,
              gender: target?.gender || null,
              unreadCount: 0,
              lastActiveAt: new Date().toISOString(),
              isVerified: Boolean(target?.isVerified),
              travelCity: target?.travel?.city || null,
            },
          };
          handleSwitchTab('messenger');
          handleSelectChat(convItem);
          setActionNotice(`Connected with ${target?.displayName || 'them'}. Send a message.`);
          setTimeout(() => setActionNotice(null), 4000);
        }
      }
    } catch (err) {
      console.error('Quick match error:', err);
    } finally {
      setSubmittingQuickMatch(false);
    }
  };

  // Submit Contact Verification (3-Option Gatekeeper)
  const handleVerifyContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationValue.trim()) return;
    setVerifyingContact(true);
    setVerificationError('');
    try {
      const res = await fetch('/api/auth/verify-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: verificationMethod,
          value: verificationValue.trim(),
          device: collectDeviceSnapshot(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowVerificationModal(false);
        setVerificationValue('');
        try {
          writeBrowserStore('local', 'match_attempts', '0');
        } catch {
          // ignore
        }
        trackPixel('Lead', { method: verificationMethod });
        setActionNotice('Verified. Keep chatting here.');
        setTimeout(() => setActionNotice(null), 3000);
        await fetchCurrentUser();

        // Automatically send the pending message if held
        if (pendingVerificationMessage && activeChat) {
          const sendRes = await fetch(`/api/conversations/${activeChat.id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ content: pendingVerificationMessage, contentType: 'text' }),
          });
          const sendData = await sendRes.json();
          if (sendData.success && sendData.data?.message) {
            setMessages((prev) => [...prev, sendData.data.message]);
            fetchConversations();
            publishChatSync({
              type: 'conversation_updated',
              conversationId: activeChat.id,
              preview: pendingVerificationMessage,
              source: 'customer',
            });
          }
          setPendingVerificationMessage(null);
        }
      } else {
        setVerificationError(data.error?.message || 'Verification failed');
      }
    } catch {
      setVerificationError('Connection error. Please try again.');
    } finally {
      setVerifyingContact(false);
    }
  };


  // Submit Contact Login for returning visitors
  const handleContactLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactLoginInput.trim()) return;
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/contact-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          contact: contactLoginInput.trim(),
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data?.redirect === '/admin' || data.data?.type === 'staff') {
          if (data.data?.token) {
            try {
              localStorage.setItem('cityhost_staff_token', data.data.token);
            } catch {}
          }
          clearExplicitLogout();
          window.location.href = data.data.redirect || '/admin';
          return;
        }
        if (data.data?.token) {
          try {
            localStorage.setItem('cityhost_user_token', data.data.token);
          } catch {}
        }
        clearExplicitLogout();
        authDeadRef.current = false;
        authReadyRef.current = true;
        setShowAuthModal(false);
        setContactLoginInput('');
        await fetchCurrentUser();
        await fetchConversations();
        await fetchProfiles();
        handleSwitchTab('messenger');
        setActionNotice('Welcome back — your chats are restored.');
        setTimeout(() => setActionNotice(null), 3500);
      } else {
        setAuthError(
          data.error?.message ||
            "This number doesn't match. Enter the correct number you used when you started chat."
        );
      }
    } catch {
      setAuthError('Connection error. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Send message handler (text, photo, or video) with Smart Verification Gatekeeper
  const handleSendMessage = async (
    e?: React.FormEvent,
    mediaData?: { mediaUrl: string; contentType: string }
  ) => {
    if (e) e.preventDefault();
    if (!activeChat || sendingMessage || uploadingMedia) return;

    const boundId = activeChat.id.startsWith('pending-')
      ? pendingBindRef.current[activeChat.id]
      : undefined;
    if (activeChat.id.startsWith('pending-') && !boundId) {
      const waitingContent = chatInput.trim();
      if (!waitingContent && !mediaData?.mediaUrl) return;
      const waitingType = mediaData?.contentType || 'text';
      const waitingMedia = mediaData?.mediaUrl || null;
      const waitingText =
        waitingContent ||
        (waitingType === 'video' ? '📹 Video' : waitingType === 'image' ? '📷 Photo' : '');
      const waitingId = `temp-${Date.now()}`;
      setChatInput('');
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: waitingId,
            conversationId: activeChat.id,
            content: waitingText,
            contentType: waitingType,
            mediaUrl: waitingMedia,
            status: 'sent',
            isAssisted: false,
            isOwn: true,
            createdAt: new Date().toISOString(),
            senderUserId: currentUser?.id || null,
          },
        ];
        threadCacheRef.current[activeChat.id] = next;
        return next;
      });
      bumpConversation(activeChat.id, waitingText);
      stickToBottomRef.current = true;
      queuedSendRef.current.push({
        pendingId: activeChat.id,
        tempId: waitingId,
        content: waitingText,
        plain: waitingContent,
        contentType: waitingType,
        mediaUrl: waitingMedia,
      });
      if (guestStateRef.current[activeChat.id] === 'failed') {
        const args = pendingGuestArgsRef.current[activeChat.id];
        if (args) {
          void handleMatchSayHi(args.profile, args.name, args.opener, args.location, args.prefs);
        }
      }
      return;
    }

    const content = chatInput.trim();
    if (!content && !mediaData?.mediaUrl) return;

    const effectiveContentType = mediaData?.contentType || 'text';
    const effectiveMediaUrl = mediaData?.mediaUrl || null;
    const effectiveContent = content || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    const conversationId = boundId || activeChat.id;
    const tempId = `temp-${Date.now()}`;
    setChatInput('');
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
    }
    setSendingMessage(true);

    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: tempId,
          conversationId,
          content: effectiveContent,
          contentType: effectiveContentType,
          mediaUrl: effectiveMediaUrl,
          status: 'sent',
          isAssisted: false,
          isOwn: true,
          createdAt: new Date().toISOString(),
          senderUserId: currentUser?.id || null,
        },
      ];
      threadCacheRef.current[conversationId] = next;
      return next;
    });
    bumpConversation(conversationId, effectiveContent);
    stickToBottomRef.current = true;

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          content: effectiveContent,
          contentType: effectiveContentType,
          mediaUrl: effectiveMediaUrl,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.message) {
        setMessages((prev) => {
          const next = [
            ...prev.filter((m) => m.id !== tempId),
            data.data.message,
          ];
          threadCacheRef.current[conversationId] = next;
          messagesFpRef.current = threadFingerprint(next);
          return next;
        });
        fetchConversations(true);
        setFirstMessageSent(true);
        publishChatSync({
          type: 'conversation_updated',
          conversationId,
          preview: effectiveContent,
          source: 'customer',
        });
        try {
          writeBrowserStore('local', 'has_chatted', 'true');
          writeBrowserStore('local', 'last_conv_id', conversationId);
        } catch {}
      } else if (data.error?.code === 'VERIFICATION_REQUIRED') {
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== tempId);
          threadCacheRef.current[conversationId] = next;
          return next;
        });
        setPendingVerificationMessage(effectiveContent);
        setShowVerificationModal(true);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (!mediaData) setChatInput(content);
        setActionNotice(data.error?.message || 'Could not send message');
        setTimeout(() => setActionNotice(null), 3000);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (!mediaData) setChatInput(content);
      setActionNotice('Connection error. Please try again.');
      setTimeout(() => setActionNotice(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    e.target.value = '';

    setUploadingMedia(true);
    setActionNotice('Uploading media… ⏳');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/chat-media', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        await handleSendMessage(undefined, {
          mediaUrl: data.data.url,
          contentType: data.data.contentType || (file.type.startsWith('video/') ? 'video' : 'image'),
        });
        setActionNotice(null);
      } else {
        setActionNotice(data.error?.message || 'Failed to upload media');
        setTimeout(() => setActionNotice(null), 3500);
      }
    } catch {
      setActionNotice('Failed to upload file. Please try again.');
      setTimeout(() => setActionNotice(null), 3500);
    } finally {
      setUploadingMedia(false);
    }
  };

  // Block confirmation handler
  const handleConfirmBlock = async () => {
    if (!confirmBlockTarget) return;
    setBlockLoading(true);
    try {
      const res = await fetch('/api/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: confirmBlockTarget.userId }),
      });
      const data = await res.json();
      if (data.success) {
        setBlockedUserIds((prev) => [...prev, confirmBlockTarget.userId]);
        // Remove from Discover feed
        setProfiles((prev) => prev.filter((p) => p.userId !== confirmBlockTarget.userId));
        // Update activeChat status if currently chatting
        if (activeChat && activeChat.participant.userId === confirmBlockTarget.userId) {
          setActiveChat((prev: any) => (prev ? { ...prev, status: 'blocked' } : null));
        }
        // Update conversation list
        setConversations((prev) =>
          prev.map((c) =>
            c.participant.userId === confirmBlockTarget.userId ? { ...c, status: 'blocked' } : c
          )
        );
        if (selectedProfile?.userId === confirmBlockTarget.userId) {
          setSelectedProfile(null);
        }
        setActionNotice(`${confirmBlockTarget.displayName || 'User'} has been blocked.`);
        setTimeout(() => setActionNotice(null), 3500);
      } else {
        setActionNotice(data.error?.message || 'Failed to block user');
        setTimeout(() => setActionNotice(null), 3000);
      }
    } catch (err) {
      console.error('Error blocking user:', err);
    } finally {
      setBlockLoading(false);
      setConfirmBlockTarget(null);
    }
  };

  // Unblock handler
  const handleUnblockUser = async (targetUserId: string) => {
    try {
      const res = await fetch(`/api/block?userId=${targetUserId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setBlockedUserIds((prev) => prev.filter((id) => id !== targetUserId));
        if (activeChat && activeChat.participant.userId === targetUserId) {
          setActiveChat((prev: any) => (prev ? { ...prev, status: 'active' } : null));
        }
        setConversations((prev) =>
          prev.map((c) =>
            c.participant.userId === targetUserId ? { ...c, status: 'active' } : c
          )
        );
        fetchProfiles();
        setActionNotice('User unblocked.');
        setTimeout(() => setActionNotice(null), 3000);
      }
    } catch (err) {
      console.error('Error unblocking user:', err);
    }
  };

  // Travel Plan Handlers
  const handlePlanCreated = (newPlan: any) => {
    setUserTravelPlans((prev) => [newPlan, ...prev]);
    fetchCurrentUser();
    setActionNotice('Travel plan published! Travelers visiting this destination can now find you ✈');
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleDeleteTravelPlan = async (id: string) => {
    try {
      const res = await fetch(`/api/travel-plans/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setUserTravelPlans((prev) => prev.filter((p) => p.id !== id));
        setActionNotice('Travel plan removed.');
        setTimeout(() => setActionNotice(null), 2500);
      } else {
        setActionNotice(data.error?.message || 'Could not remove travel plan');
        setTimeout(() => setActionNotice(null), 2500);
      }
    } catch {
      setActionNotice('Connection error while removing plan');
      setTimeout(() => setActionNotice(null), 2500);
    }
  };

  // Toggle Privacy: Hide contact number from public view
  const handleToggleHideContact = async (checked: boolean) => {
    setHideContactNumber(checked);
    setCurrentUser((prev: any) => (prev ? { ...prev, hideContactNumber: checked } : prev));
    try {
      await fetch('/api/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideContactNumber: checked }),
      });
      setActionNotice(
        checked ? 'Last 4 digits hidden on your profile 🔒' : 'Full number visible on your profile 👁'
      );
      setTimeout(() => setActionNotice(null), 3000);
    } catch {
      // ignore
    }
  };

  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarCropFile(file);
    setShowAvatarCropper(true);
    e.target.value = '';
  };

  const handleAvatarCropped = async (croppedFile: File) => {
    setShowAvatarCropper(false);
    setAvatarCropFile(null);
    await uploadAvatarFile(croppedFile);
  };

  // Upload user avatar
  const uploadAvatarFile = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'avatar');
      formData.append('isAvatar', 'true');
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await fetchCurrentUser();
        await fetchProfiles();
        setActionNotice('Profile photo updated successfully! ✨');
        setTimeout(() => setActionNotice(null), 3000);
      } else {
        setActionNotice(data.error?.message || 'Failed to upload photo');
        setTimeout(() => setActionNotice(null), 3000);
      }
    } catch {
      setActionNotice('Error uploading avatar');
      setTimeout(() => setActionNotice(null), 3000);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // Save Profile Edits
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const interestsArray = editInterests
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);

      const res = await fetch('/api/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName.trim() || undefined,
          bio: editBio,
          lookingFor: editLookingFor || null,
          interests: interestsArray,
          gender: editGender || null,
          age: editAge ? parseInt(editAge, 10) : null,
          country: editCountry || null,
          city: editCity || null,
          hideContactNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (editDisplayName.trim()) {
          try {
            writeBrowserStore('local', 'guest_name', editDisplayName.trim());
          } catch {}
        }
        setActionNotice('Profile updated successfully! ✨');
        setTimeout(() => setActionNotice(null), 3000);
        await fetchCurrentUser();
      }
    } catch {
      setActionNotice('Failed to update profile');
      setTimeout(() => setActionNotice(null), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  // Logout handler
  const handleRefreshThread = async () => {
    if (!activeChatRef.current || refreshingThread) return;
    setRefreshingThread(true);
    try {
      await Promise.all([
        fetchMessagesRef.current(activeChatRef.current.id),
        fetchConversationsRef.current(true),
      ]);
    } finally {
      setRefreshingThread(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('cityhost_user_token');
    } catch {}
    markExplicitLogout();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user' }),
    }).catch(() => {});
    clearGuestSession();
    fetchProfiles();
  };

  const totalUnreadMessages = conversations.reduce(
    (sum, c) => sum + (c.participant.unreadCount || 0),
    0
  );

  useEffect(() => {
    setChatAppBadge(totalUnreadMessages);
  }, [totalUnreadMessages]);

  useEffect(() => {
    const base = 'City Host — Travellers visiting your city';
    document.title = totalUnreadMessages > 0 ? `(${totalUnreadMessages}) City Host` : base;
    return () => {
      document.title = base;
    };
  }, [totalUnreadMessages]);

  const handlePullRefresh = useCallback(async () => {
    try {
      if (activeTab === 'discover') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cityhost:refresh-pool'));
        }
        await fetchCurrentUser();
      } else if (activeTab === 'messenger') {
        await fetchConversations();
      } else if (activeTab === 'profile') {
        await fetchCurrentUser();
      }
    } catch {
      // Ignore refresh errors
    }
  }, [activeTab, fetchCurrentUser, fetchConversations]);

  const isChatting = activeTab === 'messenger' && Boolean(activeChat);

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      className="h-dvh flex flex-col overflow-hidden bg-surface-950 text-white font-sans selection:bg-brand-500 selection:text-white overscroll-none"
    >
      {/* Top Header — hide on mobile when inside an open chat */}
      <header
        className={`shrink-0 z-40 bg-surface-950/90 backdrop-blur-md border-b border-white/[0.06] px-4 py-2.5 pt-[max(0.55rem,env(safe-area-inset-top))] ${
          isChatting ? 'hidden md:block' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setActiveChat(null);
              setSelectedProfile(null);
              handleSwitchTab('discover');
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-2 min-w-0 hover:opacity-90 active:scale-95 transition cursor-pointer text-left -ml-1 px-1.5 py-1 rounded-xl group"
            aria-label="City Host - Home"
            title="Go to Home"
          >
            {activeTab === 'profile' && (
              <ChevronLeft className="w-5 h-5 text-surface-400 group-hover:text-white shrink-0 -mr-0.5 transition" />
            )}
            <HeartMark />
            <h1 className="brand-wordmark truncate group-hover:text-brand-300 transition">
              City <em>Host</em>
            </h1>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-surface-800/60 p-1 rounded-xl border border-surface-700/50">
            <button
              onClick={() => handleSwitchTab('discover')}
              aria-label="Discover"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'discover'
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : 'text-surface-300 hover:text-white hover:bg-surface-700/50'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Discover</span>
            </button>

            <button
              onClick={() => handleSwitchTab('messenger')}
              aria-label="Messenger"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition relative cursor-pointer ${
                activeTab === 'messenger'
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : 'text-surface-300 hover:text-white hover:bg-surface-700/50'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>Messenger</span>
              {totalUnreadMessages > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-surface-900 shadow-md shadow-rose-600/40 animate-pulse">
                  {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                </span>
              )}
            </button>

            {currentUser && (
              <button
                onClick={() => handleSwitchTab('profile')}
                aria-label="Profile"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                    : 'text-surface-300 hover:text-white hover:bg-surface-700/50'
                }`}
              >
                <UserIcon className="w-4 h-4" />
                <span>Profile</span>
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {/* Share Travel Plan Button - Only visible when registered/logged in */}
            {currentUser && (
              <button
                onClick={() => setShowTravelPlanModal(true)}
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-accent-teal/20 to-brand-500/20 hover:from-accent-teal/30 hover:to-brand-500/30 text-accent-teal border border-accent-teal/40 font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
                title="Share your upcoming travel plan"
              >
                <Plane className="w-3.5 h-3.5 text-accent-teal" />
                <span className="hidden sm:inline">Share Trip Plan</span>
                <span className="sm:hidden">Post Trip</span>
              </button>
            )}

            {currentUser ? (
              <button
                onClick={() => handleSwitchTab('profile')}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-800 transition cursor-pointer"
                title="View My Profile"
              >
                <div className="w-8 h-8 rounded-full ring-2 ring-brand-500/50 overflow-hidden bg-surface-700 flex items-center justify-center">
                  {currentUser.profile?.photos?.[0]?.filePath ? (
                    <img
                      src={currentUser.profile.photos[0].filePath}
                      alt={currentUser.profile?.displayName || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-surface-400" />
                  )}
                </div>
              </button>
            ) : (
              <button
                onClick={() => handleOpenAuthModal('contact_login')}
                className="btn-ghost py-1.5 px-3 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Action Toast Notice */}
      {actionNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-surface-800/95 backdrop-blur-md border border-brand-500/40 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>{actionNotice}</span>
          </div>
        </div>
      )}

      {/* Interactive Quick Reply Toast */}
      {activeToast && (
        <div className="fixed top-3 sm:top-5 left-3 right-3 sm:left-auto sm:right-5 sm:w-96 z-50 animate-slide-up">
          <div className="bg-surface-900/95 backdrop-blur-xl border border-surface-700/80 rounded-2xl shadow-2xl p-3.5 text-white transition-all">
            <div className="flex items-start gap-3">
              <div
                onClick={() => handleOpenChatFromToast(activeToast.conversationId)}
                className="relative w-10 h-10 rounded-full overflow-hidden bg-surface-800 shrink-0 border border-surface-700 cursor-pointer"
              >
                {activeToast.senderPhoto ? (
                  <img
                    src={activeToast.senderPhoto}
                    alt={activeToast.senderName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm text-surface-300">
                    {activeToast.senderName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div
                onClick={() => handleOpenChatFromToast(activeToast.conversationId)}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-bold text-white truncate">
                    {activeToast.senderName}
                  </h4>
                  <span className="text-[10px] text-surface-400">now</span>
                </div>
                <p className="text-xs text-surface-300 truncate mt-0.5">
                  {activeToast.preview}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveToast(null)}
                className="text-surface-400 hover:text-white p-1 -mr-1 rounded-lg transition"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Reply Form */}
            {toastSent ? (
              <div className="mt-2.5 pt-2 border-t border-surface-800 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Reply sent</span>
              </div>
            ) : toastReplying ? (
              <form onSubmit={handleSendToastQuickReply} className="mt-2.5 pt-2 border-t border-surface-800 flex items-center gap-2">
                <input
                  type="text"
                  value={toastReplyText}
                  onChange={(e) => setToastReplyText(e.target.value)}
                  placeholder="Type a reply..."
                  className="flex-1 bg-surface-800/90 border border-surface-700 text-white placeholder-surface-400 text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-brand-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={toastSending || !toastReplyText.trim()}
                  className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition shadow-sm"
                >
                  {toastSending ? '...' : <Send className="w-3 h-3" />}
                </button>
              </form>
            ) : (
              <div className="mt-2 pt-2 border-t border-surface-800/80 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => handleOpenChatFromToast(activeToast.conversationId)}
                  className="text-surface-400 hover:text-white transition cursor-pointer"
                >
                  Open chat
                </button>
                <button
                  type="button"
                  onClick={() => setToastReplying(true)}
                  className="text-brand-400 hover:text-brand-300 font-semibold transition cursor-pointer"
                >
                  Quick Reply
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN VIEW — fills remaining viewport (app shell) */}
      <main
        className={`flex-1 min-h-0 w-full mx-auto transition-transform ${
          slideDirection === 'left'
            ? 'animate-slide-in-right'
            : slideDirection === 'right'
              ? 'animate-slide-in-left'
              : ''
        } ${
          activeTab === 'messenger'
            ? 'max-w-5xl overflow-hidden'
            : 'max-w-4xl overflow-y-auto overscroll-contain px-3 sm:px-4 py-3'
        }`}
      >
        {/* ============================================================ */}
        {/* AREA 1: DISCOVERY & MATCHING                                  */}
        {/* ============================================================ */}
        {navReady && activeTab === 'discover' && (
          <MatchFunnel onSayHi={handleMatchSayHi} currentUser={currentUser} />
        )}

        {/* ============================================================ */}
        {/* AREA 2: MESSENGER & CHAT (PREMIUM MOBILE-FIRST POLISH)       */}
        {/* ============================================================ */}
        {navReady && activeTab === 'messenger' && (
          <div className="h-full flex flex-col md:flex-row bg-surface-950 md:border-x border-surface-800">
            {/* Conversation List Sidebar */}
            <div
              className={`w-full md:w-80 lg:w-96 md:border-r border-surface-800 flex flex-col bg-surface-950 shrink-0 h-full ${
                activeChat ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Sidebar Header */}
              <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between shrink-0">
                <h2 className="font-bold text-base text-white tracking-tight">Chats</h2>
                <button
                  type="button"
                  onClick={() => fetchConversations()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-200 hover:text-white border border-surface-700/80 transition cursor-pointer"
                  title="Refresh chats"
                  aria-label="Refresh chats"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin text-red-400' : ''}`} />
                  <span className="text-[11px] font-semibold">Refresh</span>
                </button>
              </div>

              <NotifyPrompt
                armed={Boolean(
                  currentUser &&
                    (conversations.length > 0 || firstMessageSent || replyArrived)
                )}
              />

              {/* Quick Search Filter (if conversations exist) */}
              {currentUser && conversations.length > 0 && (
                <div className="px-3.5 pt-3 pb-2 border-b border-surface-800/60">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={conversationSearch}
                      onChange={(e) => setConversationSearch(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full bg-surface-800/70 border border-surface-700/60 focus:border-brand-500/80 focus:ring-1 focus:ring-brand-500/30 rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-white placeholder-surface-400 focus:outline-none transition"
                    />
                    {conversationSearch && (
                      <button
                        onClick={() => setConversationSearch('')}
                        className="absolute right-2.5 text-surface-400 hover:text-white p-0.5 text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Conversations List Scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {loadingUser ? (
                  <div className="p-3 space-y-2.5">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="flex items-center gap-3 p-3 rounded-2xl bg-surface-800/30 animate-pulse border border-surface-800/50">
                        <div className="w-12 h-12 rounded-full bg-surface-700/60 shrink-0" />
                        <div className="flex-1 space-y-2 py-1 min-w-0">
                          <div className="h-3.5 w-1/3 bg-surface-700/60 rounded-md" />
                          <div className="h-3 w-2/3 bg-surface-700/40 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !currentUser ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center h-64">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                      <HeartMark />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">Welcome back</h3>
                    <p className="text-xs text-surface-400 mb-4 max-w-xs">
                      Use the same mobile number from your chat. No password.
                    </p>
                    <button
                      onClick={() => handleOpenAuthModal('contact_login')}
                      className="py-2.5 px-5 rounded-xl bg-white text-surface-950 text-xs font-bold hover:bg-zinc-100 transition cursor-pointer"
                    >
                      Continue
                    </button>
                  </div>
                ) : loadingConversations && conversations.length === 0 ? (
                  <div className="p-3 space-y-2.5">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="flex items-center gap-3 p-3 rounded-2xl bg-surface-800/30 animate-pulse border border-surface-800/50">
                        <div className="w-12 h-12 rounded-full bg-surface-700/60 shrink-0" />
                        <div className="flex-1 space-y-2 py-1 min-w-0">
                          <div className="h-3.5 w-1/3 bg-surface-700/60 rounded-md" />
                          <div className="h-3 w-2/3 bg-surface-700/40 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center h-72">
                    <div className="w-12 h-12 rounded-2xl bg-surface-800/80 border border-surface-700/50 flex items-center justify-center mb-3 text-brand-400">
                      <MessageCircle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-white mb-1">No chats yet</p>
                    <p className="text-xs text-surface-400 max-w-xs mb-4">
                      Like and match with profiles in Discover to start conversations!
                    </p>
                    <button
                      onClick={() => setActiveTab('discover')}
                      className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition flex items-center gap-1"
                    >
                      <span>Explore Discover</span>
                      <span>→</span>
                    </button>
                  </div>
                ) : (conversations.filter(c => !conversationSearch.trim() || c.participant.displayName.toLowerCase().includes(conversationSearch.toLowerCase().trim())).length === 0) ? (
                  <div className="p-8 text-center text-xs text-surface-400">
                    No conversations found matching &ldquo;{conversationSearch}&rdquo;
                  </div>
                ) : (
                  conversations
                    .filter(c => !conversationSearch.trim() || c.participant.displayName.toLowerCase().includes(conversationSearch.toLowerCase().trim()))
                    .slice()
                    .sort((a, b) => {
                      const ta = new Date(a.lastMessageAt || 0).getTime() || 0;
                      const tb = new Date(b.lastMessageAt || 0).getTime() || 0;
                      return tb - ta; // newest activity on top (Messenger style)
                    })
                    .map((conv) => {
                      const isSelected = activeChat?.id === conv.id;
                      const photo =
                        conv.participant.photo ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80';
                      const unread = conv.participant.unreadCount || 0;
                      const hasUnread = unread > 0;
                      const isOnline = isUserOnline(conv.participant.lastActiveAt);

                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectChat(conv)}
                          className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-surface-800/90'
                              : hasUnread
                                ? 'bg-surface-900/70 hover:bg-surface-800/80 border-l-2 border-l-rose-500'
                                : 'hover:bg-surface-800/50'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <img
                              src={photo}
                              alt={conv.participant.displayName}
                              className="w-12 h-12 rounded-full object-cover bg-surface-800"
                            />
                            {isOnline && (
                              <span
                                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-accent-teal border-2 border-surface-900 rounded-full shadow-sm"
                                title="Online now"
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0 border-b border-surface-800/40 pb-3 -mb-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={`text-[15px] truncate flex items-center gap-1.5 min-w-0 ${
                                  hasUnread ? 'font-bold text-white' : 'font-medium text-surface-200'
                                }`}
                              >
                                <span className="truncate">{conv.participant.displayName}</span>
                                {conv.participant.isVerified ? (
                                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                ) : null}
                              </span>
                              <span
                                className={`text-[11px] shrink-0 tabular-nums ${
                                  hasUnread ? 'text-rose-400 font-bold' : 'text-surface-500'
                                }`}
                              >
                                {chatListTime(conv.lastMessageAt)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p
                                className={`text-[13px] truncate ${
                                  hasUnread ? 'text-white font-medium' : 'text-surface-500'
                                }`}
                              >
                                {conv.lastMessagePreview || 'Say hi…'}
                              </p>
                              {hasUnread && (
                                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-rose-600 text-white text-[11px] font-extrabold shrink-0 shadow-md shadow-rose-600/40">
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            {/* Active Chat Conversation Area */}
            <div
              className={`flex-1 flex flex-col bg-surface-950 min-w-0 min-h-0 h-full ${
                activeChat ? 'flex' : 'hidden md:flex'
              }`}
            >
              {activeChat ? (
                <>
                  {/* Chat Header */}
                  <div className="px-3 py-2.5 border-b border-surface-800 bg-surface-950 flex items-center justify-between shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))] md:pt-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={handleCloseChat}
                        className="md:hidden p-2.5 -ml-1.5 text-surface-300 hover:text-white hover:bg-surface-800 rounded-xl transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                        aria-label="Back to conversation list"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    {(() => {
                      const isPeerOnline = isUserOnline(activeChat.participant.lastActiveAt);
                      return (
                        <div
                          onClick={() => handleOpenChatParticipantProfile(activeChat.participant)}
                          className="flex items-center gap-3 min-w-0 cursor-pointer group"
                          title={`View ${activeChat.participant.displayName}'s profile`}
                        >
                          <div className="relative shrink-0">
                            <img
                              src={
                                activeChat.participant.photo ||
                                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
                              }
                              alt={activeChat.participant.displayName}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-500/30 shadow-md group-hover:ring-brand-400 transition"
                            />
                            {isPeerOnline && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent-teal border-2 border-surface-900 rounded-full shadow-sm" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="text-sm font-bold text-white tracking-tight truncate group-hover:text-brand-300 transition">
                                {activeChat.participant.displayName}
                              </h3>
                              {activeChat.participant.isVerified ? (
                                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 inline-block drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
                              ) : null}
                            </div>
                            <div className="mt-0.5">
                              {isPeerOnline ? (
                                <p className="text-[11px] text-accent-teal font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-accent-teal inline-block animate-pulse" />
                                  Online now
                                </p>
                              ) : activeChat.participant.lastActiveAt ? (
                                <p className="text-[11px] text-surface-400 font-medium">
                                  Active {lastSeenTime(activeChat.participant.lastActiveAt)}
                                </p>
                              ) : activeChat.participant.travelCity ? (
                                <TrustBadges
                                  visitingCity={activeChat.participant.travelCity}
                                  inViewerCity={Boolean(
                                    viewerCity &&
                                      activeChat.participant.travelCity.toLowerCase() === viewerCity.toLowerCase()
                                  )}
                                />
                              ) : (
                                <p className="text-[11px] text-surface-400 font-medium">
                                  {activeChat.participant.isVerified ? 'Verified traveller' : 'Travelling soon'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleRefreshThread}
                        disabled={refreshingThread || activeChat.id.startsWith('pending-')}
                        className="p-2 text-surface-300 hover:text-white hover:bg-surface-800 rounded-xl transition cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center disabled:opacity-50"
                        title="Refresh messages"
                        aria-label="Refresh messages"
                      >
                        <RefreshCw className={`w-5 h-5 ${refreshingThread ? 'animate-spin text-emerald-400' : ''}`} />
                      </button>
                      {blockedUserIds.includes(activeChat.participant.userId) ? (
                        <button
                          onClick={() => handleUnblockUser(activeChat.participant.userId)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white border border-surface-700 transition cursor-pointer flex items-center gap-1 min-h-[36px]"
                          title="Unblock User"
                        >
                          <span>Unblock</span>
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirmBlockTarget({
                              userId: activeChat.participant.userId,
                              displayName: activeChat.participant.displayName,
                              conversationId: activeChat.id,
                            })
                          }
                          className="p-2 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
                          title={`Block ${activeChat.participant.displayName}`}
                          aria-label="Block user"
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCloseChat}
                        className="p-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-xl transition cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
                        title="Close chat (Esc)"
                        aria-label="Close chat"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Top Chat Install Bar: directly and permanently visible in browser */}
                  <InstallPrompt
                    armed={true}
                    forceVisible={true}
                    permanent={true}
                    bannerMode={true}
                    senderName={activeChat.participant.displayName}
                  />

                  {/* Messages Bubble List */}
                  <div
                    ref={chatScrollRef}
                    onScroll={handleChatScroll}
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-2 bg-surface-950"
                  >
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-surface-400">
                        <div className="w-14 h-14 rounded-full bg-surface-800/80 border border-surface-700/50 flex items-center justify-center mb-3 overflow-hidden">
                          <img
                            src={
                              activeChat.participant.photo ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'
                            }
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-sm font-semibold text-white mb-1">
                          {activeChat.participant.displayName}
                        </p>
                        <p className="text-xs text-surface-400 max-w-xs">
                          Messages are private. Say hi to start the conversation.
                        </p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => {
                        const isMe = Boolean(
                          msg.id.startsWith('temp-') ||
                            msg.isOwn === true ||
                            (!msg.senderStaffId &&
                              Boolean(msg.senderUserId) &&
                              Boolean(currentUser?.id) &&
                              msg.senderUserId === currentUser.id)
                        );
                        const prevMsg = idx > 0 ? messages[idx - 1] : null;
                        const showDay = !prevMsg || !sameCalendarDay(prevMsg.createdAt, msg.createdAt);
                        const pending = msg.id.startsWith('temp-');

                        if (msg.content === '__REQUEST_HUMAN_VERIFICATION__') {
                          return null;
                        }

                        return (
                          <div key={msg.id}>
                            {showDay && <DayChip label={dayLabel(msg.createdAt)} />}
                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-0.5`}>
                              <div
                                className={`max-w-[82%] sm:max-w-[70%] px-2.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm ${
                                  isMe
                                    ? 'bg-emerald-700/90 text-white rounded-2xl rounded-br-sm'
                                    : 'bg-surface-800 text-surface-50 rounded-2xl rounded-bl-sm border border-surface-700/40'
                                } ${pending ? 'opacity-70' : ''}`}
                              >
                                {msg.mediaUrl && (
                                  <div className="my-1 rounded-xl overflow-hidden bg-black/40 max-w-full">
                                    {msg.contentType === 'video' || msg.mediaUrl.match(/\.(mp4|webm|mov|ogg|m4v)$/i) ? (
                                      <video
                                        src={msg.mediaUrl}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="rounded-xl max-w-full max-h-64 object-cover w-full"
                                      />
                                    ) : (
                                      <img
                                        src={msg.mediaUrl}
                                        alt="Shared media"
                                        className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition"
                                        onClick={() => window.open(msg.mediaUrl!, '_blank')}
                                      />
                                    )}
                                  </div>
                                )}
                                {msg.content && msg.content !== '📷 Photo' && msg.content !== '📹 Video' && (
                                  <p className="whitespace-pre-wrap break-words select-text">
                                    {msg.content}
                                  </p>
                                )}
                                <div
                                  className={`flex items-center justify-end gap-1 mt-0.5 ${
                                    isMe ? 'text-white/55' : 'text-surface-500'
                                  }`}
                                >
                                  <span className="text-[10px] tabular-nums leading-none">
                                    {chatBubbleTime(msg.createdAt)}
                                  </span>
                                  {isMe && <MessageTicks status={msg.status} pending={pending} />}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {peerTyping && (
                      <TypingIndicator name={activeChat.participant.displayName} />
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input Box or Blocked Banner */}
                  {activeChat.status === 'blocked' || blockedUserIds.includes(activeChat.participant.userId) ? (
                    <div className="p-3.5 sm:p-4 border-t border-surface-800/80 bg-surface-900/90 backdrop-blur-xl flex items-center justify-between gap-3 sticky bottom-0 z-20">
                      <div className="flex items-center gap-2 text-surface-400 text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>This user is blocked. Messages cannot be sent.</span>
                      </div>
                      {blockedUserIds.includes(activeChat.participant.userId) && (
                        <button
                          onClick={() => handleUnblockUser(activeChat.participant.userId)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-white border border-surface-700 transition cursor-pointer shrink-0"
                        >
                          Unblock User
                        </button>
                      )}
                    </div>
                  ) : (!(chatUnlocked || currentUser?.isVerifiedLead || currentUser?.phone) &&
                       messages.some((m) => m.content === '__REQUEST_HUMAN_VERIFICATION__')) ? (
                    <div className="p-4 sm:p-5 border-t border-surface-800/80 bg-surface-950/95 sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl animate-fade-in">
                      <div className="max-w-md mx-auto">
                        <div className="flex items-center justify-center gap-2 mb-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <p className="text-center text-sm font-bold text-white leading-snug">
                            Start chat with {activeChat.participant.displayName}
                          </p>
                        </div>
                        <p className="text-center text-[11px] text-surface-400 mb-3.5">
                          Enter your nickname & number to connect directly. No password needed.
                        </p>

                        {inlinePhoneError && (
                          <div className="mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-[11px] flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{inlinePhoneError}</span>
                          </div>
                        )}

                        <form onSubmit={handleInboxRegisterSubmit} className="space-y-2.5">
                          <div>
                            <input
                              type="text"
                              autoComplete="name"
                              value={inlineNameInput}
                              onChange={(e) => {
                                setInlineNameInput(e.target.value);
                                if (inlinePhoneError) setInlinePhoneError('');
                              }}
                              placeholder="Your name or nickname"
                              autoFocus
                              disabled={submittingInlinePhone}
                              className="w-full h-11 bg-surface-800/80 border border-surface-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3.5 text-xs sm:text-sm text-white placeholder:text-surface-500 focus:outline-none transition"
                            />
                          </div>
                          <div>
                            <input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              value={inlinePhoneInput}
                              onChange={(e) => {
                                setInlinePhoneInput(e.target.value);
                                if (inlinePhoneError) setInlinePhoneError('');
                              }}
                              placeholder="Mobile or WhatsApp number"
                              disabled={submittingInlinePhone}
                              className="w-full h-11 bg-surface-800/80 border border-surface-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3.5 text-xs sm:text-sm text-white placeholder:text-surface-500 focus:outline-none transition"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={
                              inlineNameInput.trim().length < 2 ||
                              !inlinePhoneInput.trim() ||
                              submittingInlinePhone
                            }
                            className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-surface-950 text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-35 disabled:shadow-none disabled:cursor-not-allowed"
                          >
                            {submittingInlinePhone ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin text-surface-950" />
                                <span>Connecting & starting chat…</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4 text-surface-950" />
                                <span>Start Chat</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => handleSendMessage(e)}
                      className="p-2 sm:p-3 border-t border-surface-800/80 bg-surface-900/95 flex items-end gap-1.5 sm:gap-2 sticky bottom-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                    >
                      {/* Hidden File Input for Photos and Videos */}
                      <input
                        type="file"
                        ref={chatMediaInputRef}
                        accept="image/*,video/*"
                        onChange={handleMediaUpload}
                        className="hidden"
                      />

                      {/* Photo/Video Attachment Button */}
                      <button
                        type="button"
                        onClick={() => chatMediaInputRef.current?.click()}
                        disabled={uploadingMedia || sendingMessage}
                        className="w-10 h-10 rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-50 border border-surface-700/60"
                        title="Attach photo or video"
                        aria-label="Attach photo or video"
                      >
                        {uploadingMedia ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
                        ) : (
                          <Camera className="w-5 h-5 text-surface-300" />
                        )}
                      </button>

                      <div className="flex-1 min-h-[44px] bg-surface-800 border border-surface-700/70 focus-within:border-surface-500 rounded-[22px] px-4 py-1.5 transition-colors flex items-center">
                        <textarea
                          ref={chatTextareaRef}
                          autoFocus
                          rows={1}
                          value={chatInput}
                          onChange={(e) => {
                            setChatInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                          }}
                          onKeyDown={(e) => {
                            const isMobile =
                              typeof window !== 'undefined' &&
                              ('ontouchstart' in window || navigator.maxTouchPoints > 0);
                            if (e.key === 'Enter') {
                              if (isMobile || e.shiftKey) {
                                // Mobile virtual Enter or PC Shift+Enter: allow newline
                                return;
                              }
                              // PC normal Enter: send message immediately
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          placeholder="Message"
                          disabled={sendingMessage || uploadingMedia}
                          className="w-full bg-transparent text-[15px] text-white placeholder-surface-500 focus:outline-none resize-none max-h-28 overflow-y-auto leading-relaxed py-1"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={(!chatInput.trim() && !uploadingMedia) || sendingMessage}
                        className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40 disabled:hover:bg-emerald-600 transition cursor-pointer disabled:cursor-not-allowed shadow-md"
                        aria-label="Send message"
                      >
                        {sendingMessage ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-surface-800/80 border border-surface-700/60 flex items-center justify-center mb-4 text-brand-400 shadow-xl">
                    <MessageCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">Your Direct Messages</h3>
                  <p className="text-xs text-surface-400 max-w-sm leading-relaxed">
                    Select a conversation to keep chatting about the trip.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* AREA 3: PROFILE & SETTINGS                                   */}
        {/* ============================================================ */}
        {navReady && activeTab === 'profile' && (
          <div className="pb-2">
            {!currentUser && loadingUser ? (
              <div className="py-20 text-center px-4 animate-fade-in flex flex-col items-center justify-center">
                <RefreshCw className="w-7 h-7 text-brand-400 animate-spin mb-3" />
                <p className="text-xs text-surface-400 font-medium">Opening your profile...</p>
              </div>
            ) : !currentUser ? (
              <div className="py-16 text-center px-4 animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
                  <HeartMark />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Welcome back</h3>
                <p className="text-xs text-surface-400 max-w-sm mx-auto mb-4">
                  Enter the same mobile number you used in chat.
                </p>
                <button
                  onClick={() => handleOpenAuthModal('contact_login')}
                  className="py-2.5 px-6 rounded-xl bg-white text-surface-950 text-xs font-bold hover:bg-zinc-100 transition cursor-pointer"
                >
                  Continue
                </button>
                <div className="max-w-sm mx-auto mt-6">
                  <InstallPrompt armed forceVisible permanent compact />
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-lg mx-auto">
                {/* Profile Card Summary */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-5 flex flex-col items-center text-center">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden mb-3 bg-surface-800 group ring-2 ring-brand-500/30">
                    {(currentUser.profile?.photos?.find((p: any) => p.isPrimary)?.filePath || currentUser.profile?.photos?.[0]?.filePath) ? (
                      <img
                        src={currentUser.profile.photos.find((p: any) => p.isPrimary)?.filePath || currentUser.profile.photos[0].filePath}
                        alt={currentUser.profile?.displayName || 'Avatar'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-surface-400">
                        {(currentUser.profile?.displayName || 'Y').charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Hover Camera overlay for desktop */}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white cursor-pointer"
                      title="Change profile picture"
                    >
                      {uploadingAvatar ? (
                        <RefreshCw className="w-5 h-5 animate-spin text-brand-400" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 mb-0.5 text-brand-400" />
                          <span className="text-[10px] font-semibold">Change</span>
                        </>
                      )}
                    </button>
                    {/* Camera badge on bottom right for mobile touch */}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="sm:hidden absolute bottom-0 right-0 p-1.5 rounded-full bg-brand-500 text-white shadow-md border-2 border-surface-900 cursor-pointer"
                      title="Change photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileSelected}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-xl font-bold text-white">
                      {currentUser.profile?.displayName &&
                      currentUser.profile.displayName !== 'Visitor'
                        ? currentUser.profile.displayName
                        : 'Your profile'}
                      {currentUser.age ? `, ${currentUser.age}` : ''}
                    </h2>
                    {(currentUser.isVerifiedLead || currentUser.profile?.isVerified) ? (
                      <span
                        className="inline-flex items-center text-sky-400"
                        title="Verified Account"
                      >
                        <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 inline-block drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowVerificationModal(true)}
                        className="group relative inline-flex items-center justify-center p-1 rounded-full text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 active:scale-90 transition cursor-pointer"
                        title="Verify your number"
                        aria-label="Verify your number"
                      >
                        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)] group-hover:scale-110 transition" />
                        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-950/95 border border-surface-700 px-2 py-1 text-[11px] font-medium text-amber-300 shadow-xl opacity-0 group-hover:opacity-100 transition duration-200 z-20">
                          Verify your number
                        </span>
                      </button>
                    )}
                  </div>

                  {currentUser.phone ? (
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-950/80 border border-surface-800 text-xs text-surface-200 shadow-sm">
                        <span className="font-mono text-[11px] text-surface-300">
                          {hideContactNumber ? (
                            <span className="text-surface-400 tracking-wide">
                              {maskPhoneLast4(currentUser.phone)}
                            </span>
                          ) : (
                            currentUser.phone
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleHideContact(!hideContactNumber)}
                          className="p-1 rounded text-surface-400 hover:text-white transition cursor-pointer"
                          title={hideContactNumber ? 'Show contact number' : 'Hide contact number'}
                          aria-label={hideContactNumber ? 'Show contact number' : 'Hide contact number'}
                        >
                          {hideContactNumber ? (
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-surface-400 hover:text-surface-200" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                    {currentUser.profile?.gender && (
                      <span className="badge-teal">
                        {currentUser.profile.gender === 'male' ? 'Male' : 'Female'}
                      </span>
                    )}
                    {(currentUser.profile?.city || currentUser.profile?.country) && (
                      <span className="badge-teal inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {[currentUser.profile?.city, currentUser.profile?.country]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Permanent PWA App Install Card in Profile */}
                  <div className="w-full mb-3">
                    <InstallPrompt armed forceVisible permanent compact />
                  </div>

                  <div className="w-full pt-4 border-t border-surface-800 flex flex-col gap-2">
                    <button
                      onClick={handleLogout}
                      className="btn-secondary py-2 text-xs flex items-center justify-center gap-1.5 text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>

                {/* My Travel Plans Section */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane className="w-4 h-4 text-accent-teal" />
                      <h3 className="text-sm font-bold text-white">My Travel Plans ({userTravelPlans.length})</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTravelPlanModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-accent-teal/15 hover:bg-accent-teal/25 text-accent-teal border border-accent-teal/30 font-semibold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Trip</span>
                    </button>
                  </div>

                  {userTravelPlans.length === 0 ? (
                    <div className="p-5 text-center border border-dashed border-surface-800 rounded-xl space-y-2 bg-surface-950/40">
                      <Compass className="w-8 h-8 text-surface-600 mx-auto" />
                      <p className="text-xs text-surface-300 font-medium">No travel plans published yet</p>
                      <p className="text-[11px] text-surface-500 max-w-xs mx-auto">
                        Share your upcoming trip so locals in that city can find you on City Host and message you.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTravelPlanModal(true)}
                        className="btn-primary py-1.5 px-4 text-xs font-semibold inline-flex items-center gap-1.5 mt-1 cursor-pointer"
                      >
                        <Plane className="w-3.5 h-3.5" />
                        <span>Post Your Next Trip Plan ✈</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {userTravelPlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="p-3.5 rounded-xl bg-surface-950/80 border border-surface-800 flex items-start justify-between gap-3 group hover:border-surface-700 transition"
                        >
                          {plan.photoUrl && (
                            <img
                              src={plan.photoUrl}
                              alt={`${plan.city} trip`}
                              className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/10 shrink-0"
                            />
                          )}
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-accent-teal shrink-0" />
                              <span className="text-white font-bold text-xs truncate">
                                {plan.city}, {plan.country}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-400 font-medium">
                                Active
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-surface-400">
                              <Calendar className="w-3 h-3 text-surface-500 shrink-0" />
                              <span>
                                {new Date(plan.fromDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' ➔ '}
                                {new Date(plan.toDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            {plan.note && (
                              <p className="text-[11px] text-surface-300 italic line-clamp-2 pt-0.5">
                                &ldquo;{plan.note}&rdquo;
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteTravelPlan(plan.id)}
                            className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer shrink-0"
                            title="Delete this travel plan"
                            aria-label="Delete this travel plan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Profile Details Edit Form */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-5">
                  <h3 className="text-sm font-bold text-white mb-4">Edit details</h3>

                  <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                    <div>
                      <label className="input-label">Your Name</label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Enter your name"
                        maxLength={50}
                        className="input-field text-xs py-2.5"
                      />
                    </div>

                    <div>
                      <label className="input-label">I am</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['male', 'female'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setEditGender(g)}
                            className={`py-2.5 rounded-xl text-xs font-semibold capitalize transition cursor-pointer border ${
                              editGender === g
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                : 'bg-surface-800 border-surface-700/60 text-surface-400 hover:text-white'
                            }`}
                          >
                            {g === 'male' ? 'Male' : 'Female'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="input-label">Age</label>
                      <select
                        value={editAge}
                        onChange={(e) => setEditAge(e.target.value)}
                        className="input-field text-xs py-2.5"
                      >
                        <option value="">Set your age</option>
                        {Array.from({ length: 53 }, (_, i) => i + 18).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="input-label">Country</label>
                      <select
                        value={editCountry}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEditCountry(next);
                          const allowed = citiesForCountry(next);
                          if (editCity && !allowed.includes(editCity)) setEditCity('');
                        }}
                        className="input-field text-xs py-2.5"
                      >
                        <option value="">Select country</option>
                        {PROFILE_LOCATIONS.map((row) => (
                          <option key={row.country} value={row.country}>
                            {row.country}
                          </option>
                        ))}
                        {editCountry &&
                          !PROFILE_LOCATIONS.some((row) => row.country === editCountry) && (
                            <option value={editCountry}>{editCountry}</option>
                          )}
                      </select>
                    </div>

                    <div>
                      <label className="input-label">City</label>
                      <select
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        disabled={!editCountry}
                        className="input-field text-xs py-2.5 disabled:opacity-50"
                      >
                        <option value="">{editCountry ? 'Select city' : 'Pick a country first'}</option>
                        {citiesForCountry(editCountry).map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                        {editCity && !citiesForCountry(editCountry).includes(editCity) && (
                          <option value={editCity}>{editCity}</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="input-label">I want to meet</label>
                      <select
                        value={editLookingFor}
                        onChange={(e) => setEditLookingFor(e.target.value)}
                        className="input-field text-xs py-2.5"
                      >
                        <option value="">Skip for now</option>
                        <option value="local_guide">Locals in the city I am visiting</option>
                        <option value="travel_partner">Travellers coming to my city</option>
                      </select>
                    </div>

                    <div>
                      <label className="input-label">About Me (Bio)</label>
                      <textarea
                        rows={3}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="What cities you know, or what you want to see on this trip..."
                        className="input-field text-xs py-2"
                      />
                    </div>

                    <div>
                      <label className="input-label">Interests & Tags (Comma separated)</label>
                      <input
                        type="text"
                        value={editInterests}
                        onChange={(e) => setEditInterests(e.target.value)}
                        placeholder="e.g. Travel, Art, Music, Coffee, Photography"
                        className="input-field text-xs py-2.5"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="btn-primary py-2 px-5 text-xs font-semibold"
                      >
                        {savingProfile ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM NAVIGATION BAR — strictly hidden when chatting */}
      {/* ============================================================ */}
      {!isChatting && (
        <nav className="bottom-nav md:hidden">
          <button
            onClick={() => handleSwitchTab('discover')}
            className={`nav-item ${activeTab === 'discover' ? 'active' : ''}`}
            aria-label="Discover"
            aria-current={activeTab === 'discover' ? 'page' : undefined}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Discover</span>
          </button>

          <button
            onClick={() => handleSwitchTab('messenger')}
            className={`nav-item ${activeTab === 'messenger' ? 'active' : ''}`}
            aria-label="Messenger"
            aria-current={activeTab === 'messenger' ? 'page' : undefined}
          >
            <div className="relative">
              <MessageCircle className="w-5 h-5" />
              {totalUnreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-surface-950 shadow-lg shadow-rose-600/50 animate-pulse">
                  {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">Messenger</span>
          </button>

          <button
            onClick={() => handleSwitchTab('profile')}
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            aria-label="Profile"
            aria-current={activeTab === 'profile' ? 'page' : undefined}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
        </nav>
      )}

      {/* ============================================================ */}
      {/* MODAL: PROFILE DETAILS & BIO                                  */}
      {/* ============================================================ */}
      {selectedProfile && (
        <ProfileViewModal
          profile={selectedProfile}
          onClose={handleCloseProfile}
          onChat={() => {
            const target = selectedProfile;
            handleCloseProfile();
            setPageChannelModalProfile(target);
            setShowPageChannelModal(true);
          }}
          chatButtonText={activeChat?.participant?.userId === selectedProfile.userId ? 'Chat' : 'Say hi'}
          showBlockButton={Boolean(currentUser && currentUser.id !== selectedProfile.userId)}
          onBlock={() => {
            setConfirmBlockTarget({
              userId: selectedProfile.userId,
              displayName: selectedProfile.displayName,
            });
          }}
        />
      )}

      {/* MODAL: 3-OPTION MESSAGING CHANNELS (DIRECT, WHATSAPP, TELEGRAM) */}
      <MessageChannelModal
        isOpen={showPageChannelModal}
        onClose={() => {
          setShowPageChannelModal(false);
          setPageChannelModalProfile(null);
        }}
        profile={pageChannelModalProfile}
        onDirectChat={(p) => {
          const uid = p.userId || p.id;
          if (uid) {
            handleStartConversation(uid);
          }
        }}
      />

      {/* ============================================================ */}
      {/* MODAL: CONFIRM USER BLOCK                                    */}
      {/* ============================================================ */}
      {confirmBlockTarget && (
        <div className="modal-overlay z-50" onClick={() => setConfirmBlockTarget(null)}>
          <div
            className="modal-content max-w-sm p-6 space-y-4 text-center border-red-500/30 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Block {confirmBlockTarget.displayName || 'this user'}?
              </h3>
              <p className="text-xs text-surface-400 leading-relaxed">
                They will not be able to send you messages, and will not appear in your Discover feed.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setConfirmBlockTarget(null)}
                className="btn-secondary flex-1 py-2 text-xs cursor-pointer min-h-[40px]"
                disabled={blockLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlock}
                className="flex-1 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition cursor-pointer min-h-[40px] flex items-center justify-center shadow-lg shadow-red-600/20"
                disabled={blockLoading}
                aria-label="Confirm block user"
              >
                {blockLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Block User'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ============================================================ */}
      {/* MODAL: PHONE LOGIN (returning visitor)                        */}
      {/* ============================================================ */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={handleCloseAuthModal}>
          <div
            className="modal-content max-w-sm relative px-6 py-7 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseAuthModal}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                <HeartMark />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Welcome back</h3>
              <p className="text-[13px] text-surface-400 mt-1.5 leading-relaxed max-w-[16rem]">
                Enter the same mobile number you used in chat. No password.
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200 text-xs leading-relaxed text-center">
                {authError}
              </div>
            )}

            <form onSubmit={handleContactLoginSubmit} className="space-y-4">
              <div>
                <label className="input-label text-[11px] uppercase tracking-wider">Mobile number</label>
                <input
                  type="text"
                  autoComplete="tel"
                  required
                  value={contactLoginInput}
                  onChange={(e) => {
                    setContactLoginInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  placeholder="Enter mobile number with country code"
                  className="input-field text-sm py-3 rounded-xl"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting || !contactLoginInput.trim()}
                className="w-full py-3.5 rounded-2xl bg-white text-surface-950 hover:bg-zinc-100 text-sm font-bold shadow-xl shadow-white/10 transition-all cursor-pointer disabled:opacity-50"
              >
                {authSubmitting ? 'Signing in…' : 'Continue'}
              </button>
            </form>

            <p className="mt-5 text-[11px] text-surface-500 text-center leading-relaxed">
              New here? Find someone first — your account is created when you send a message.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: QUICK MATCH CRITERIA (ZERO UPFRONT REGISTRATION)      */}
      {/* ============================================================ */}
      {showQuickMatchModal && (
        <div className="modal-overlay z-50" onClick={() => setShowQuickMatchModal(false)}>
          <div
            className="modal-content max-w-md relative p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 text-[10px] font-bold uppercase tracking-wider">
                    On this site
                  </span>
                  <span className="text-surface-400 text-xs">• Just your name</span>
                </div>
                <h3 className="text-lg font-extrabold text-white">
                  {quickMatchTargetProfile
                    ? `What should ${quickMatchTargetProfile.displayName} call you?`
                    : 'What should she call you?'}
                </h3>
                <p className="text-xs text-surface-300 mt-0.5">
                  You will chat here. No password. No other apps yet.
                </p>
              </div>
              <button
                onClick={() => setShowQuickMatchModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Profile Spotlight if selected */}
            {quickMatchTargetProfile && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/80 border border-brand-500/30 mb-4">
                <img
                  src={
                    quickMatchTargetProfile.photos?.[0]?.filePath ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
                  }
                  alt={quickMatchTargetProfile.displayName}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-500"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <span>{quickMatchTargetProfile.displayName}</span>
                    {quickMatchTargetProfile.age && (
                      <span className="text-xs text-surface-300 font-normal">
                        ({quickMatchTargetProfile.age})
                      </span>
                    )}
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  </h4>
                  <p className="text-xs text-brand-300 truncate">
                    {quickMatchTargetProfile.travel
                      ? `${quickMatchTargetProfile.travel.city} · say hi here`
                      : 'Ready to chat on this site'}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleQuickMatchSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="input-label">Your first name</label>
                <input
                  type="text"
                  required
                  value={quickMatchName}
                  onChange={(e) => setQuickMatchName(e.target.value)}
                  placeholder="Enter your first name"
                  className="input-field text-xs py-2.5"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={submittingQuickMatch || !quickMatchName.trim()}
                className="btn-primary w-full py-3 text-xs font-bold mt-2 shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submittingQuickMatch ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Opening chat...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      Start chatting
                      {quickMatchTargetProfile?.displayName
                        ? ` with ${quickMatchTargetProfile.displayName}`
                        : ''}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-surface-800 text-center text-xs text-surface-400">
              <p>
                Returning user?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMatchModal(false);
                    setShowAuthModal(true);
                  }}
                  className="text-brand-400 font-semibold hover:underline cursor-pointer"
                >
                  Log in with your mobile number
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: 3-OPTION CONTACT VERIFICATION GATEKEEPER (MSG 3)       */}
      {/* ============================================================ */}
      {showVerificationModal && (
        <div className="modal-overlay z-50" onClick={() => setShowVerificationModal(false)}>
          <div
            className="modal-content max-w-md relative p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                    Verify to continue
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-white">
                  Verify your account to keep chatting
                </h3>
                <p className="text-xs text-surface-300 mt-1">
                  Chat stays on this site. Verify with your number, WhatsApp, or Telegram — or install the app for one-tap return.
                </p>
              </div>
              <button
                onClick={() => setShowVerificationModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {verificationError && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{verificationError}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setVerificationMethod('whatsapp');
                  setVerificationError('');
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer text-center ${
                  verificationMethod === 'whatsapp'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-surface-800 border-surface-700/60 text-surface-400 hover:text-white'
                }`}
              >
                <MessageCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-semibold">WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setVerificationMethod('phone');
                  setVerificationError('');
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer text-center ${
                  verificationMethod === 'phone'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-md shadow-blue-500/10'
                    : 'bg-surface-800 border-surface-700/60 text-surface-400 hover:text-white'
                }`}
              >
                <Phone className="w-5 h-5 text-blue-400" />
                <span className="text-xs font-semibold">Mobile</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setVerificationMethod('telegram');
                  setVerificationError('');
                }}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer text-center ${
                  verificationMethod === 'telegram'
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md shadow-sky-500/10'
                    : 'bg-surface-800 border-surface-700/60 text-surface-400 hover:text-white'
                }`}
              >
                <Send className="w-5 h-5 text-sky-400" />
                <span className="text-xs font-semibold">Telegram</span>
              </button>
            </div>

            <form onSubmit={handleVerifyContactSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="input-label">
                  {verificationMethod === 'whatsapp'
                    ? 'WhatsApp number'
                    : verificationMethod === 'phone'
                    ? 'Mobile number'
                    : 'Telegram username or number'}
                </label>
                <input
                  type="text"
                  required
                  value={verificationValue}
                  onChange={(e) => setVerificationValue(e.target.value)}
                  placeholder={
                    verificationMethod === 'whatsapp'
                      ? 'Enter WhatsApp number with country code'
                      : verificationMethod === 'phone'
                      ? 'Enter mobile number with country code'
                      : 'Enter Telegram username or number'
                  }
                  className="input-field text-xs py-2.5"
                  autoFocus
                />
                <p className="text-[11px] text-surface-400 mt-1">
                  We will not move this chat off the site. This only unlocks more matching and keeps your conversation.
                </p>
              </div>

              <button
                type="submit"
                disabled={verifyingContact || !verificationValue.trim()}
                className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50"
              >
                {verifyingContact ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying…
                  </span>
                ) : (
                  'Verify & continue'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <PostTravelPlanModal
        isOpen={showTravelPlanModal}
        onClose={() => setShowTravelPlanModal(false)}
        currentUser={currentUser}
        onPlanCreated={handlePlanCreated}
      />

      <ImageCropperModal
        isOpen={showAvatarCropper}
        file={avatarCropFile}
        aspectRatio={1}
        cropShape="round"
        title="Adjust Profile Picture"
        onCrop={handleAvatarCropped}
        onCancel={() => {
          setShowAvatarCropper(false);
          setAvatarCropFile(null);
        }}
      />
    </PullToRefresh>
  );
}
