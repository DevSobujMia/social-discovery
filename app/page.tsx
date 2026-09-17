'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Heart,
  X,
  MessageCircle,
  User as UserIcon,
  Compass,
  SlidersHorizontal,
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
  ExternalLink,
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
  EyeOff
} from 'lucide-react';
import InstallPrompt from './components/InstallPrompt';
import PullToRefresh from './components/PullToRefresh';
import MatchFunnel, { type MatchProfile as FunnelMatch } from './components/MatchFunnel';
import { PostTravelPlanModal } from '@/components/PostTravelPlanModal';
import {
  chatBubbleTime,
  chatListTime,
  DayChip,
  dayLabel,
  MessageTicks,
  sameCalendarDay,
  TypingIndicator,
} from './components/messaging';
import {
  MatchReason,
  TravelNote,
  TravelRibbon,
  TravelUrgencyBadge,
} from './components/TravelBadge';
import {
  collectDeviceSnapshot,
  clearExplicitLogout,
  getDeviceToken,
  inferVisitorAge,
  isExplicitLogout,
  loadAdParams,
  markExplicitLogout,
  type AdParams,
} from '@/lib/device';
import { citiesForCountry, maskPhoneLast4, PROFILE_LOCATIONS } from '@/lib/market';
import { trackPixel } from '@/lib/pixel';
import { publishChatSync, subscribeChatSync } from '@/lib/chat-sync';
import { threadFingerprint } from '@/lib/chat-thread';

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
  hasLiked?: boolean;
  isMatched?: boolean;
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
}

type AppTab = 'discover' | 'messenger' | 'profile';

const NAV_TAB_KEY = 'heartlink_tab';
const NAV_CHAT_OPEN_KEY = 'heartlink_chat_open';
const NAV_CHAT_META_KEY = 'heartlink_last_chat';
const NAV_THREAD_KEY = 'heartlink_last_thread';
const NAV_CHAT_ID_KEY = 'heartlink_last_conv_id';

function readNavTab(): AppTab {
  if (typeof window === 'undefined') return 'discover';
  try {
    const t = window.localStorage.getItem(NAV_TAB_KEY);
    if (t === 'messenger' || t === 'profile' || t === 'discover') return t;
  } catch {
    // ignore
  }
  return 'discover';
}

function persistNavTab(tab: AppTab) {
  try {
    window.localStorage.setItem(NAV_TAB_KEY, tab);
  } catch {
    // ignore
  }
}

function persistChatOpen(open: boolean) {
  try {
    window.localStorage.setItem(NAV_CHAT_OPEN_KEY, open ? '1' : '0');
  } catch {
    // ignore
  }
}

function persistChatMeta(conv: ConversationItem) {
  if (!conv?.id || conv.id.startsWith('pending-')) return;
  try {
    window.localStorage.setItem(NAV_CHAT_ID_KEY, conv.id);
    window.localStorage.setItem(NAV_CHAT_META_KEY, JSON.stringify(conv));
  } catch {
    // ignore
  }
}

function persistThread(conversationId: string, messages: ChatMessage[]) {
  if (!conversationId || conversationId.startsWith('pending-')) return;
  try {
    window.localStorage.setItem(
      NAV_THREAD_KEY,
      JSON.stringify({ id: conversationId, messages: messages.slice(-80) })
    );
  } catch {
    // ignore
  }
}

function readStoredChatMeta(): ConversationItem | null {
  try {
    const raw = window.localStorage.getItem(NAV_CHAT_META_KEY);
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
    const raw = window.localStorage.getItem(NAV_THREAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearNavPersistence() {
  try {
    window.localStorage.removeItem(NAV_TAB_KEY);
    window.localStorage.removeItem(NAV_CHAT_OPEN_KEY);
    window.localStorage.removeItem(NAV_CHAT_META_KEY);
    window.localStorage.removeItem(NAV_THREAD_KEY);
    window.localStorage.removeItem(NAV_CHAT_ID_KEY);
  } catch {
    // ignore
  }
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
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [filterGender, setFilterGender] = useState<string>('female');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterLookingFor, setFilterLookingFor] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [newMatchData, setNewMatchData] = useState<{ match: any; profile: Profile; conversationId?: string } | null>(null);

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
  const [travellersInCity, setTravellersInCity] = useState(0);
  // Armed once a reply has landed OR the visitor sent a first message.
  const [replyArrived, setReplyArrived] = useState(false);
  const [firstMessageSent, setFirstMessageSent] = useState(false);
  const [replySenderName, setReplySenderName] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshingThread, setRefreshingThread] = useState(false);

  // Profile Edit state
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

  const newMatchDataRef = useRef(newMatchData);
  newMatchDataRef.current = newMatchData;

  const showAuthModalRef = useRef(showAuthModal);
  showAuthModalRef.current = showAuthModal;

  const showVerificationModalRef = useRef(showVerificationModal);
  showVerificationModalRef.current = showVerificationModal;

  const showQuickMatchModalRef = useRef(showQuickMatchModal);
  showQuickMatchModalRef.current = showQuickMatchModal;

  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;
  const messagesFpRef = useRef('');
  const threadCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const messageFetchGenRef = useRef<Record<string, number>>({});
  const fetchMessagesRef = useRef<(conversationId: string) => Promise<void>>(async () => {});

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  /** Stop inbox/message polls after a 401 until the user signs in again. */
  const authDeadRef = useRef(false);
  /** Don't poll until the first /api/auth/me finishes (avoids orphan-cookie spam after DB wipe). */
  const authReadyRef = useRef(false);

  // Block management state
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [confirmBlockTarget, setConfirmBlockTarget] = useState<{ userId: string; displayName?: string; conversationId?: string } | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const confirmBlockTargetRef = useRef(confirmBlockTarget);
  confirmBlockTargetRef.current = confirmBlockTarget;

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
      window.history.back();
    }
  };

  const handleOpenMatchModal = (matchData: { match: any; profile: Profile; conversationId?: string }) => {
    setNewMatchData(matchData);
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'match' }, '');
    }
  };

  const handleCloseMatchModal = () => {
    setNewMatchData(null);
    if (typeof window !== 'undefined' && window.history.state?.modal === 'match') {
      window.history.back();
    }
  };

  const savePendingIntent = (intent: PendingIntent | null) => {
    setPendingIntent(intent);
    try {
      if (intent) {
        sessionStorage.setItem('heartlink_intent', JSON.stringify(intent));
      } else {
        sessionStorage.removeItem('heartlink_intent');
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
      localStorage.setItem('heartlink_has_chatted', 'true');
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
    if (tab !== 'messenger') persistChatOpen(false);
    if (tab === activeTabRef.current) return;
    setActiveTab(tab);
    if (tab === 'messenger') {
      fetchConversations();
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({ tab }, '');
    }
  };

  // Handle Browser Back / Mobile Hardware Back
  useEffect(() => {
    const openVerify = () => setShowVerificationModal(true);
    window.addEventListener('heartlink:open-verify', openVerify);
    return () => window.removeEventListener('heartlink:open-verify', openVerify);
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
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
      // 2. Close match celebration modal
      if (newMatchDataRef.current) {
        setNewMatchData(null);
        return;
      }
      // 3. Close verification or quick match modal
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
      // 5. Return from active chat to conversation list
      if (activeChatRef.current) {
        setActiveChat(null);
        persistChatOpen(false);
        persistNavTab('messenger');
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
      const tab = readNavTab();
      setActiveTab(tab);
      if (tab === 'messenger') {
        const chatOpen = window.localStorage.getItem(NAV_CHAT_OPEN_KEY) === '1';
        const meta = readStoredChatMeta();
        const thread = readStoredThread();
        if (chatOpen && meta) {
          setActiveChat(meta);
          if (thread?.id === meta.id && thread.messages.length) {
            threadCacheRef.current[meta.id] = thread.messages;
            setMessages(thread.messages);
            messagesFpRef.current = threadFingerprint(thread.messages);
          }
        }
      }
    } catch {
      // Stay on discover if storage is unavailable.
    }
    setNavReady(true);
  }, []);

  // Handle Desktop Escape Key for all modals
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
        } else if (newMatchDataRef.current) {
          handleCloseMatchModal();
        } else if (showAuthModalRef.current) {
          handleCloseAuthModal();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // UTM Attribution Capture & Intent Restoration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Restore pending intent if any
      try {
        const rawIntent = sessionStorage.getItem('heartlink_intent');
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
          sessionStorage.setItem('heartlink_utm', JSON.stringify(utmData));
          localStorage.setItem('heartlink_utm', JSON.stringify(utmData));
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
    // Drop the orphan JWT so polls cannot keep 401-spamming after a DB reset.
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scope: 'user' }),
    }).catch(() => {});
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      if (!currentUserRef.current) setLoadingUser(true);
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
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
        // Soft clear — do not call logout here (me already drops orphan cookies).
        authDeadRef.current = true;
        setCurrentUser(null);
        currentUserRef.current = null;
        setActiveChat(null);
        setConversations([]);
        setMessages([]);
        threadCacheRef.current = {};
        messageFetchGenRef.current = {};
        setChatUnlocked(false);
        return null;
      }
    } catch {
      authDeadRef.current = true;
      setCurrentUser(null);
      currentUserRef.current = null;
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
      setStoredGuestName(localStorage.getItem('heartlink_guest_name'));
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
      setLoadingProfiles(true);
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
        setTravellersInCity(data.data.travellersInViewerCity || 0);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    } finally {
      setLoadingProfiles(false);
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
      const res = await fetch('/api/conversations', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.status === 401) {
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
        setConversations(normalized);

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

        // Restore the last open thread after a PWA / page reload.
        if (normalized.length > 0 && !initialChatOpenedRef.current) {
          initialChatOpenedRef.current = true;
          const storedTab = readNavTab();
          const lastId = (() => {
            try {
              return window.localStorage.getItem(NAV_CHAT_ID_KEY);
            } catch {
              return null;
            }
          })();
          const chatOpen = (() => {
            try {
              return window.localStorage.getItem(NAV_CHAT_OPEN_KEY) === '1';
            } catch {
              return false;
            }
          })();
          if (storedTab === 'messenger' && chatOpen && lastId) {
            const conv = normalized.find((c) => c.id === lastId);
            if (conv) {
              if (!activeChatRef.current || activeChatRef.current.id === lastId) {
                setActiveChat(conv);
                persistChatMeta(conv);
              }
            }
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

  // Fetch messages for active chat
  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!authReadyRef.current || authDeadRef.current || !currentUserRef.current) return;
    const gen = (messageFetchGenRef.current[conversationId] || 0) + 1;
    messageFetchGenRef.current[conversationId] = gen;
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?limit=300&ts=${Date.now()}`,
        {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }
      );
      if (messageFetchGenRef.current[conversationId] !== gen) return;
      if (res.status === 401) {
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
        const temps = prev.filter(
          (m) => m.id.startsWith('temp-') && (m.conversationId || conversationId) === conversationId
        );
        const serverTexts = new Set(incoming.map((m) => (m.content || '').trim()));
        const pending = temps.filter((m) => !serverTexts.has((m.content || '').trim()));
        const next = pending.length ? [...incoming, ...pending] : incoming;
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

  // Single inbox poll loop — empty deps so Fast Refresh cannot stack intervals.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (
        authReadyRef.current &&
        !authDeadRef.current &&
        currentUserRef.current
      ) {
        await fetchConversationsRef.current(true);
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    };

    timer = setTimeout(tick, 3000);
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
      const chatId = activeChatRef.current?.id;
      if (
        chatId &&
        activeTabRef.current === 'messenger' &&
        authReadyRef.current &&
        !authDeadRef.current &&
        currentUserRef.current
      ) {
        await fetchMessagesRef.current(chatId);
      }
      if (!stopped) timer = setTimeout(tick, 800);
    };

    timer = setTimeout(tick, 800);
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
    const unsub = subscribeChatSync((event) => {
      if (authDeadRef.current) return;
      fetchConversationsRef.current(true);
      const viewing =
        activeTabRef.current === 'messenger' &&
        activeChatRef.current?.id === event.conversationId;
      if (viewing) {
        fetchMessagesRef.current(event.conversationId);
      } else if (event.source === 'staff') {
        setConversations((prev) =>
          sortConversations(
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
          )
        );
      }
    });

    return () => {
      window.removeEventListener('focus', kick);
      document.removeEventListener('visibilitychange', onVis);
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
              },
            };
            setConversations((prev) => [fallbackConv, ...prev.filter((c) => c.id !== convId)]);
            handleSelectChat(fallbackConv);
          }
          setActionNotice(`Chat ready with ${activeIntent.profileName || 'your match'}! Send a message. ✨`);
          setTimeout(() => setActionNotice(null), 4000);
        }
      } catch (err) {
        console.error('Failed to auto-execute conversation intent:', err);
      }
    } else if (activeIntent.action === 'like') {
      await handleInteraction(activeIntent.targetUserId, 'like');
    }
  };

  // Interaction handlers (Like, Pass, Connect)
  const handleInteraction = async (targetUserId: string, type: 'like' | 'pass' | 'connect') => {
    if (!currentUser) {
      if (type === 'pass') {
        setActionNotice('Passed to next profile ⏩');
        setTimeout(() => setActionNotice(null), 1500);
        return;
      }
      const targetProfile = profiles.find((p) => p.userId === targetUserId) || selectedProfile;
      handleOpenQuickMatch(targetProfile || null);
      return;
    }

    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, type }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.data?.isMatch) {
          const matchedProfile = profiles.find((p) => p.userId === targetUserId);
          if (matchedProfile) {
            handleOpenMatchModal({
              match: data.data.match,
              profile: matchedProfile,
              conversationId: data.data.conversationId,
            });
          }
        }

        // Show feedback toast
        const labels: Record<string, string> = {
          like: 'Liked! If they like you back, it will be a match! ❤️',
          pass: 'Passed to next profile ⏩',
          connect: 'Connection request sent! 🤝',
        };
        setActionNotice(labels[type] || 'Action recorded');
        setTimeout(() => setActionNotice(null), 3000);

        // Update local profile state
        setProfiles((prev) =>
          prev.map((p) => (p.userId === targetUserId ? { ...p, hasLiked: type === 'like' } : p))
        );
      } else {
        setActionNotice(data.error?.message || 'Action could not be completed');
        setTimeout(() => setActionNotice(null), 3000);
      }
    } catch (err) {
      console.error('Interaction failed:', err);
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

  /** Landing funnel: open the chat shell instantly, then bind the guest session. */
  const handleMatchSayHi = async (
    profile: FunnelMatch,
    visitorName: string,
    opener?: string,
    visitorLocation?: string,
    prefs?: { lookingForGender: 'female' | 'male' }
  ) => {
    const pendingId = `pending-${profile.userId}`;
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
      },
    };

    persistNavTab('messenger');
    persistChatOpen(true);
    setActiveTab('messenger');
    setActiveChat(optimistic);
    setConversations((prev) => {
      if (prev.some((c) => c.participant.userId === profile.userId || c.id === pendingId)) {
        return prev;
      }
      return [optimistic, ...prev];
    });
    if (opener?.trim()) setPendingChatOpener(opener.trim());
    setInlinePhoneError('');
    if (visitorName && visitorName !== 'Visitor' && visitorName !== 'Guest Traveler') {
      setInlineNameInput(visitorName);
    } else if (storedGuestName && storedGuestName !== 'Visitor' && storedGuestName !== 'Guest Traveler') {
      setInlineNameInput(storedGuestName);
    }

    // Only establish backend conversation if user is already logged in / verified.
    // Anonymous visitors will create their profile only when they submit Name + Phone.
    if (currentUserRef.current?.id && currentUserRef.current?.isVerifiedLead) {
      try {
        let storedUtm: any = null;
        try {
          const raw = sessionStorage.getItem('heartlink_utm') || localStorage.getItem('heartlink_utm');
          if (raw) storedUtm = JSON.parse(raw);
        } catch {}

        const res = await fetch('/api/auth/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: currentUserRef.current.profile?.displayName || 'Visitor',
            targetUserId: profile.userId,
            utm: storedUtm,
            deviceToken: getDeviceToken(),
            device: collectDeviceSnapshot(),
            adCity: visitorLocation || adParams?.city || undefined,
            adCountry: adParams?.country || undefined,
          }),
        });

        const data = await res.json();
        if (data.success && data.data?.conversationId) {
          const realId = data.data.conversationId as string;
          const convItem: ConversationItem = { ...optimistic, id: realId };
          if (threadCacheRef.current[pendingId]) {
            threadCacheRef.current[realId] = threadCacheRef.current[pendingId];
            delete threadCacheRef.current[pendingId];
          }
          setActiveChat((prev) =>
            prev && (prev.id === pendingId || prev.id === realId) ? convItem : prev
          );
          setConversations((prev) => {
            const mapped = prev.map((c) => (c.id === pendingId ? convItem : c));
            if (!mapped.some((c) => c.id === realId)) return [convItem, ...mapped];
            return mapped.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
          });
          persistChatMeta(convItem);
        }
      } catch {
        // Fallback gracefully
      }
    }
  };

  // Name + phone in one step: creates the account, lead, and first message.
  const handleInboxRegisterSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChat || submittingInlinePhone) return;

    const cleanName = inlineNameInput.trim();
    const cleanPhone = inlinePhoneInput.trim();
    if (!cleanName || cleanName.length < 2 || !cleanPhone) return;

    const conversationId = activeChat.id;
    const targetUserId = activeChat.participant?.userId;
    const firstMessage = pendingChatOpener?.trim() || `Hi, I'm ${cleanName}!`;
    const tempId = `temp-${Date.now()}`;

    setSubmittingInlinePhone(true);
    setInlinePhoneError('');
    setChatUnlocked(true);
    setChatInput('');
    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: tempId,
          conversationId,
          content: firstMessage,
          contentType: 'text',
          mediaUrl: null,
          status: 'sent',
          isAssisted: false,
          isOwn: true,
          createdAt: new Date().toISOString(),
          senderUserId: currentUser?.id || null,
        },
      ];
      threadCacheRef.current[conversationId] = next;
      persistThread(conversationId, next);
      return next;
    });
    bumpConversation(conversationId, firstMessage);
    stickToBottomRef.current = true;

    try {
      try {
        localStorage.setItem('heartlink_guest_name', cleanName);
        setStoredGuestName(cleanName);
      } catch {}

      const res = await fetch('/api/auth/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          conversationId,
          targetUserId,
          firstMessage,
          deviceToken: getDeviceToken(),
          device: collectDeviceSnapshot(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setChatUnlocked(false);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInlinePhoneError(data.error?.message || 'Could not start chat with this number.');
        return;
      }

      authDeadRef.current = false;
      authReadyRef.current = true;
      trackPixel('Lead', { method: 'phone' });
      setPendingChatOpener(null);

      const nextId = data.data?.conversationId || conversationId;
      const sent = data.data?.message;
      if (sent) {
        setMessages((prev) => {
          const next = [...prev.filter((m) => m.id !== tempId && m.id !== sent.id), sent];
          threadCacheRef.current[nextId] = next;
          messagesFpRef.current = threadFingerprint(next);
          return next;
        });
        bumpConversation(nextId, firstMessage);
      }
      setFirstMessageSent(true);
      triggerPeerTyping(activeChat.participant.displayName);
      publishChatSync({
        type: 'conversation_updated',
        conversationId: nextId,
        preview: firstMessage,
        source: 'customer',
      });

      void fetchCurrentUser();
      void fetchConversations(true);
      void fetchMessagesRef.current(nextId);
    } catch {
      setChatUnlocked(false);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
        const raw = sessionStorage.getItem('heartlink_utm') || localStorage.getItem('heartlink_utm');
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
            },
          };
          handleSwitchTab('messenger');
          handleSelectChat(convItem);
          setActionNotice(`Connected with ${target?.displayName || 'your match'}! Send a message. ✨`);
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
          localStorage.setItem('heartlink_match_attempts', '0');
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
        setAuthError(data.error?.message || 'No account found with this contact');
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
    if (activeChat.id.startsWith('pending-')) return;

    const content = chatInput.trim();
    if (!content && !mediaData?.mediaUrl) return;

    const effectiveContentType = mediaData?.contentType || 'text';
    const effectiveMediaUrl = mediaData?.mediaUrl || null;
    const effectiveContent = content || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    const conversationId = activeChat.id;
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
          localStorage.setItem('heartlink_has_chatted', 'true');
          localStorage.setItem('heartlink_last_conv_id', conversationId);
        } catch {}
        // Assisted chats feel alive while the operator is about to reply.
        if (activeChat.type === 'assisted' || activeChat.participant) {
          triggerPeerTyping(activeChat.participant.displayName);
        }
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

  // Upload user avatar
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        setActionNotice('Profile updated successfully! ✨');
        setTimeout(() => setActionNotice(null), 3000);
        fetchCurrentUser();
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
    markExplicitLogout();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user' }),
    });
    clearGuestSession();
    fetchProfiles();
  };

  const totalUnreadMessages = conversations.reduce(
    (sum, c) => sum + (c.participant.unreadCount || 0),
    0
  );

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

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      className="h-dvh flex flex-col overflow-hidden bg-surface-950 text-white font-sans selection:bg-brand-500 selection:text-white overscroll-none"
    >
      {/* Top Header — hide on mobile when inside an open chat */}
      <header
        className={`shrink-0 z-40 bg-surface-950 border-b border-surface-800 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] ${
          activeTab === 'messenger' && activeChat ? 'hidden md:block' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Heart className="w-4 h-4 text-white fill-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">City Host</h1>
          </div>

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
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-surface-950 text-[10px] font-bold flex items-center justify-center ring-2 ring-surface-900">
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

      {/* MAIN VIEW — fills remaining viewport (app shell) */}
      <main
        className={`flex-1 min-h-0 w-full mx-auto ${
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

        {/* Legacy discover grid kept inert — landing is MatchFunnel only */}
        {false && (
          <div className="space-y-4">
            {/* Filter bar & Actions */}
            <div className="flex items-center justify-between gap-3 bg-surface-900/60 p-3 rounded-2xl border border-surface-800">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
                <button
                  onClick={() => setFilterGender('')}
                  className={`px-3 py-1.5 rounded-full font-medium transition ${
                    filterGender === '' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterGender('female')}
                  className={`px-3 py-1.5 rounded-full font-medium transition ${
                    filterGender === 'female' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
                  }`}
                >
                  Women
                </button>
                <button
                  onClick={() => setFilterGender('male')}
                  className={`px-3 py-1.5 rounded-full font-medium transition ${
                    filterGender === 'male' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
                  }`}
                >
                  Men
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    showFilters || filterCountry || filterLookingFor
                      ? 'bg-brand-500/10 border-brand-500/40 text-brand-300'
                      : 'bg-surface-800 border-surface-700 text-surface-300 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                </button>
                <button
                  onClick={fetchProfiles}
                  className="p-1.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white border border-surface-700 transition"
                  title="Refresh profiles"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingProfiles ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Filter Expansion Drawer */}
            {showFilters && (
              <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-slide-up">
                <div>
                  <label className="input-label">City they are visiting</label>
                  <select
                    value={filterCountry}
                    onChange={(e) => setFilterCountry(e.target.value)}
                    className="input-field py-2 text-xs"
                  >
                    <option value="">Any city</option>
                    <option value="Dubai">Dubai</option>
                    <option value="Abu Dhabi">Abu Dhabi</option>
                    <option value="Riyadh">Riyadh</option>
                    <option value="Jeddah">Jeddah</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Looking For</label>
                  <select
                    value={filterLookingFor}
                    onChange={(e) => setFilterLookingFor(e.target.value)}
                    className="input-field py-2 text-xs"
                  >
                    <option value="">Anyone visiting</option>
                    <option value="local_guide">Find local guide</option>
                    <option value="travel_partner">Find travel partner</option>
                    <option value="friendship">Friendship</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => {
                      setFilterCountry('');
                      setFilterLookingFor('');
                      setFilterGender('');
                    }}
                    className="btn-ghost py-1 px-3 text-xs"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="btn-primary py-1 px-4 text-xs"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}

            {/* Profiles Feed (Cards Grid) */}
            {loadingProfiles ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="glass-card h-96 animate-pulse p-4 flex flex-col justify-end">
                    <div className="h-6 w-2/3 bg-surface-700 rounded mb-2" />
                    <div className="h-4 w-1/2 bg-surface-700 rounded" />
                  </div>
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="glass-card p-12 text-center my-8">
                <Plane className="w-12 h-12 text-surface-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">
                  {viewerCity ? `No one visiting ${viewerCity} just yet` : 'No travellers right now'}
                </h3>
                <p className="text-sm text-surface-400 max-w-sm mx-auto mb-4">
                  New trips are added every week. Say hi to whoever is closest, or check back in a few days.
                </p>
                <button
                  onClick={() => {
                    setFilterCountry('');
                    setFilterGender('');
                    setFilterLookingFor('');
                  }}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {profiles.map((profile) => {
                  const photoUrl =
                    profile.photos?.[0]?.filePath ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80';

                  return (
                    <div
                      key={profile.id}
                      className="group glass-card overflow-hidden flex flex-col relative transition-all duration-300 hover:border-brand-500/50 hover:shadow-xl hover:shadow-brand-500/10"
                    >
                      {/* Photo banner with overlay */}
                      <div
                        onClick={() => handleOpenProfile(profile)}
                        className="relative h-80 w-full cursor-pointer overflow-hidden bg-surface-800"
                      >
                        <img
                          src={photoUrl}
                          alt={profile.displayName}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/20 to-transparent" />

                        {/* Badges on photo */}
                        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {profile.lookingFor === 'local_guide' && (
                              <span className="badge bg-surface-900/80 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 backdrop-blur-md">
                                Find local guide
                              </span>
                            )}
                            {profile.lookingFor === 'travel_partner' && (
                              <span className="badge bg-surface-900/80 text-brand-300 border border-brand-500/30 text-[10px] px-2 py-0.5 backdrop-blur-md">
                                Find travel partner
                              </span>
                            )}
                          </div>
                          {profile.travel && <TravelUrgencyBadge travel={profile.travel} />}
                        </div>

                        {/* Name & Basic Info at bottom of photo */}
                        <div className="absolute bottom-3 left-3 right-3 space-y-1.5">
                          {profile.travel && <TravelRibbon travel={profile.travel} />}
                          <div className="flex items-center gap-1.5">
                            <h2 className="text-xl font-bold text-white tracking-tight">
                              {profile.displayName}
                            </h2>
                            {profile.age && (
                              <span className="text-lg font-semibold text-surface-300">
                                {profile.age}
                              </span>
                            )}
                            {profile.isVerified && (
                              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 inline-block drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-surface-300 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                            <span className="truncate">
                              From {[profile.city, profile.country].filter(Boolean).join(', ') || 'abroad'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bio preview & interests */}
                      <div className="p-3.5 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-surface-400 line-clamp-2 mb-3">
                          {profile.bio || 'Ready to connect and share new adventures.'}
                        </p>

                        {/* Interests chips */}
                        {profile.interests?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {profile.interests.slice(0, 3).map((interest) => (
                              <span
                                key={interest}
                                className="text-[10px] bg-surface-800/80 text-surface-300 px-2 py-0.5 rounded-md border border-surface-700/60"
                              >
                                {interest}
                              </span>
                            ))}
                            {profile.interests.length > 3 && (
                              <span className="text-[10px] text-surface-500 py-0.5">
                                +{profile.interests.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action: always on-site chat. Contact capture happens after 2 messages. */}
                        <div className="flex items-center gap-2 pt-2 border-t border-surface-800">
                          <button
                            onClick={() => handleOpenProfile(profile)}
                            className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-surface-800 hover:bg-surface-700 text-xs font-semibold text-surface-200 transition border border-surface-700/60 text-center cursor-pointer flex items-center justify-center"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleStartConversation(profile.userId)}
                            className="flex-[1.4] py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-brand-600 to-pink-500 hover:from-brand-500 hover:to-pink-400 text-xs font-semibold text-white transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                            title="Say hi on this site"
                            aria-label="Say hi"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>Say hi</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Meta Ads Compliant Footer & Legal Disclosures */}
            <footer className="mt-14 pt-8 pb-16 border-t border-surface-800/80 text-center space-y-3 text-xs text-surface-400">
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
                <Link href="/legal/privacy" className="hover:text-white transition">Privacy Policy</Link>
                <span>·</span>
                <Link href="/legal/terms" className="hover:text-white transition">Terms of Service</Link>
                <span>·</span>
                <Link href="/legal/terms#safety" className="hover:text-white transition">Safety Guidelines</Link>
              </div>
              <p className="text-[11px] text-surface-500 max-w-md mx-auto leading-relaxed">
                City Host is a local meetup and travel-companion platform. Chat stays on City Host — add it to your home screen so replies are waiting when you come back.
              </p>
              <p className="text-[10px] text-surface-600 font-medium">
                © {new Date().getFullYear()} City Host. All rights reserved.
              </p>
            </footer>
          </div>
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
                  <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin text-emerald-400' : ''}`} />
                  <span className="text-[11px] font-semibold">Refresh</span>
                </button>
              </div>

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
                    <div className="w-12 h-12 rounded-2xl bg-surface-800 border border-surface-700/60 flex items-center justify-center mb-3 text-brand-400">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">Log in to view messages</h3>
                    <p className="text-xs text-surface-400 mb-4 max-w-xs">
                      Use the mobile number from your chat. No password.
                    </p>
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="btn-primary py-2 px-5 text-xs font-semibold rounded-xl"
                    >
                      Login
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

                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectChat(conv)}
                          className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-surface-800/90'
                              : hasUnread
                                ? 'bg-surface-900/40 hover:bg-surface-800/60'
                                : 'hover:bg-surface-800/50'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <img
                              src={photo}
                              alt={conv.participant.displayName}
                              className="w-12 h-12 rounded-full object-cover bg-surface-800"
                            />
                          </div>

                          <div className="flex-1 min-w-0 border-b border-surface-800/40 pb-3 -mb-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={`text-[15px] truncate ${
                                  hasUnread ? 'font-bold text-white' : 'font-semibold text-surface-100'
                                }`}
                              >
                                {conv.participant.displayName}
                              </span>
                              <span
                                className={`text-[11px] shrink-0 tabular-nums ${
                                  hasUnread ? 'text-emerald-400 font-semibold' : 'text-surface-500'
                                }`}
                              >
                                {chatListTime(conv.lastMessageAt)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p
                                className={`text-[13px] truncate ${
                                  hasUnread ? 'text-surface-200 font-medium' : 'text-surface-500'
                                }`}
                              >
                                {conv.lastMessagePreview || 'Say hi…'}
                              </p>
                              {hasUnread && (
                                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-emerald-500 text-surface-950 text-[11px] font-bold shrink-0">
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
                      <div
                        onClick={() => {
                          const matched = profiles.find((p) => p.userId === activeChat.participant.userId);
                          if (matched) handleOpenProfile(matched);
                        }}
                        className="flex items-center gap-3 min-w-0 cursor-pointer group"
                        title="View profile"
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
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent-teal border-2 border-surface-900 rounded-full" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-white tracking-tight truncate group-hover:text-brand-300 transition">
                              {activeChat.participant.displayName}
                            </h3>
                            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 inline-block drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
                          </div>
                          <p className="text-[11px] text-surface-400 font-medium mt-0.5">
                            Travelling soon
                          </p>
                        </div>
                      </div>
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
                    </div>
                  </div>

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
                  ) : !(
                      chatUnlocked ||
                      currentUser?.isVerifiedLead ||
                      currentUser?.phone
                    ) ? (
                    <div className="p-4 sm:p-5 border-t border-surface-800/80 bg-surface-950/95 sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl">
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
                  ) : activeChat.id.startsWith('pending-') ? (
                    <div className="p-4 sm:p-5 border-t border-surface-800/80 bg-surface-950/95 sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))]">
                      <div className="flex items-center justify-center gap-2 text-xs text-surface-300">
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Opening chat…</span>
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
                    Select a conversation from the list to start chatting with your matches in real time.
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
            {!currentUser ? (
              <div className="py-16 text-center px-4">
                <UserIcon className="w-10 h-10 text-surface-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Log in</h3>
                <p className="text-xs text-surface-400 max-w-sm mx-auto mb-4">
                  Use the mobile number from your chat.
                </p>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="btn-primary py-2.5 px-6 text-xs font-semibold"
                >
                  Login
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-w-lg mx-auto">
                {/* Profile Card Summary */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-5 flex flex-col items-center text-center">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden mb-3 bg-surface-800 group ring-2 ring-brand-500/30">
                    {currentUser.profile?.photos?.[0]?.filePath ? (
                      <img
                        src={currentUser.profile.photos[0].filePath}
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
                      onChange={handleAvatarUpload}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <h2 className="text-xl font-bold text-white">
                      {currentUser.profile?.displayName &&
                      currentUser.profile.displayName !== 'Visitor'
                        ? currentUser.profile.displayName
                        : 'Your profile'}
                      {currentUser.age ? `, ${currentUser.age}` : ''}
                    </h2>
                    {(currentUser.isVerifiedLead || currentUser.profile?.isVerified) && (
                      <span title="Verified Account">
                        <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 inline-block drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                      </span>
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
                    {currentUser.phone && (
                      <span className="badge-brand">Verified number</span>
                    )}
                  </div>

                  <div className="w-full mb-3">
                    <InstallPrompt armed forceVisible compact />
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
                        Post your upcoming trip details so travel partners visiting the same destination can match with you!
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
                          <div className="space-y-1 min-w-0">
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
                        <option value="local_guide">A local guide</option>
                        <option value="travel_partner">A travel partner</option>
                        <option value="friendship">Friends in the city</option>
                      </select>
                    </div>

                    <div>
                      <label className="input-label">About Me (Bio)</label>
                      <textarea
                        rows={3}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Tell others what you love, your passions, and what brings you joy..."
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
      {/* MOBILE BOTTOM NAVIGATION BAR                                 */}
      {/* ============================================================ */}
      <nav className={`bottom-nav md:hidden ${!navReady || (activeTab === 'messenger' && activeChat) ? 'hidden' : ''}`}>
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
          className={`nav-item relative ${activeTab === 'messenger' ? 'active' : ''}`}
          aria-label="Messenger"
          aria-current={activeTab === 'messenger' ? 'page' : undefined}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Messenger</span>
          {totalUnreadMessages > 0 && (
            <span className="absolute top-1 right-3 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-surface-950 text-[9px] font-bold flex items-center justify-center">
              {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
            </span>
          )}
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

      {/* ============================================================ */}
      {/* MODAL: PROFILE DETAILS & BIO                                  */}
      {/* ============================================================ */}
      {selectedProfile && (
        <div className="modal-overlay" onClick={handleCloseProfile}>
          <div
            className="modal-content max-w-lg overflow-hidden p-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header image */}
            <div className="relative h-72 sm:h-80 w-full bg-surface-900">
              <img
                src={
                  selectedProfile.photos?.[0]?.filePath ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
                }
                alt={selectedProfile.displayName}
                className="w-full h-full object-cover"
              />
              
              {/* Prominent Back Button (Top-Left) */}
              <button
                onClick={handleCloseProfile}
                className="absolute top-3.5 left-3.5 z-20 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition shadow-lg border border-white/10 cursor-pointer min-h-[36px]"
                aria-label="Back to discover"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              {/* Explicit Close Button (Top-Right) */}
              <button
                onClick={handleCloseProfile}
                className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md transition shadow-lg border border-white/10 cursor-pointer min-w-[36px] min-h-[36px]"
                aria-label="Close profile details"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 space-y-1.5">
                {selectedProfile.travel && (
                  <TravelRibbon travel={selectedProfile.travel} />
                )}
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-extrabold text-white">
                    {selectedProfile.displayName}{' '}
                    {selectedProfile.age && <span className="font-normal">{selectedProfile.age}</span>}
                  </h3>
                  {selectedProfile.isVerified && (
                    <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                  )}
                </div>
                {selectedProfile.contact && (
                  <div className="flex items-center gap-1.5 text-xs text-sky-300 mt-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-black/60 border border-sky-400/40 font-mono text-[11px] backdrop-blur-sm">
                      {selectedProfile.contact}
                    </span>
                  </div>
                )}
                <p className="text-xs text-surface-300 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-400" />
                  From {[selectedProfile.city, selectedProfile.country].filter(Boolean).join(', ') || 'abroad'} · Planning upcoming trip
                </p>
              </div>
            </div>

            {/* Modal details body */}
            <div className="p-5 space-y-4 text-xs">
              {selectedProfile.matchReason && (
                <MatchReason reason={selectedProfile.matchReason} />
              )}
              {selectedProfile.travel?.note && (
                <TravelNote note={selectedProfile.travel.note} />
              )}

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1">
                  About
                </h4>
                <p className="text-surface-300 leading-relaxed text-xs sm:text-sm">
                  {selectedProfile.bio || 'No written bio provided yet.'}
                </p>
              </div>

              {selectedProfile.interests?.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1.5">
                    Passions & Interests
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProfile.interests.map((interest) => (
                      <span
                        key={interest}
                        className="bg-surface-800 text-surface-200 px-2.5 py-1 rounded-lg border border-surface-700"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal footer action */}
              <div className="pt-3 border-t border-surface-800 flex gap-3">
                <button
                  onClick={() => {
                    handleInteraction(selectedProfile.userId, 'pass');
                    setSelectedProfile(null);
                  }}
                  className="btn-secondary flex-1 py-2.5 text-xs text-center min-h-[44px] cursor-pointer"
                >
                  Pass
                </button>
                <button
                  onClick={() => {
                    const uid = selectedProfile.userId;
                    handleStartConversation(uid);
                    setSelectedProfile(null);
                  }}
                  className="btn-primary flex-1 py-2.5 text-xs text-center flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Say hi</span>
                </button>
              </div>

              {/* Block Profile Action */}
              {currentUser && currentUser.id !== selectedProfile.userId && (
                <div className="pt-2 flex justify-center border-t border-surface-800/60 mt-3">
                  <button
                    onClick={() =>
                      setConfirmBlockTarget({
                        userId: selectedProfile.userId,
                        displayName: selectedProfile.displayName,
                      })
                    }
                    className="text-[11px] text-surface-400 hover:text-red-400 flex items-center gap-1.5 transition py-1 px-3 rounded-lg hover:bg-red-500/10 cursor-pointer"
                    title="Block this user"
                    aria-label="Block this user"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Block {selectedProfile.displayName}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
      {/* MODAL: MUTUAL MATCH CELEBRATION                              */}
      {/* ============================================================ */}
      {newMatchData && (
        <div className="modal-overlay" onClick={handleCloseMatchModal}>
          <div
            className="modal-content text-center p-6 border-brand-500/50 shadow-2xl shadow-brand-500/20 max-w-sm relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Explicit Close Button */}
            <button
              onClick={handleCloseMatchModal}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-800/80 hover:bg-surface-700 text-surface-400 hover:text-white flex items-center justify-center transition cursor-pointer min-w-[32px] min-h-[32px]"
              aria-label="Close match celebration"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand-500 to-pink-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-extrabold text-white mb-1">It’s a Match! 🎉</h3>
            <p className="text-xs text-surface-300 mb-4">
              You and <strong className="text-white">{newMatchData.profile.displayName}</strong> liked each
              other!
            </p>

            <div className="flex justify-center gap-3 mb-5">
              <img
                src={
                  currentUser?.profile?.photos?.[0]?.filePath ||
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80'
                }
                alt="Me"
                className="w-16 h-16 rounded-full object-cover ring-2 ring-brand-500"
              />
              <img
                src={
                  newMatchData.profile.photos?.[0]?.filePath ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
                }
                alt={newMatchData.profile.displayName}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-brand-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  const targetConvId = newMatchData.conversationId;
                  handleCloseMatchModal();
                  handleSwitchTab('messenger');
                  const convs = await fetchConversations();
                  if (targetConvId && Array.isArray(convs)) {
                    const matchedConv = convs.find((c: any) => c.id === targetConvId);
                    if (matchedConv) handleSelectChat(matchedConv);
                  }
                }}
                className="btn-primary py-2.5 text-xs font-semibold min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                Send a Message
              </button>
              <button
                onClick={handleCloseMatchModal}
                className="btn-ghost py-2 text-xs min-h-[40px] cursor-pointer"
              >
                Keep Exploring
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
            className="modal-content max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Welcome back</h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  Log in with the mobile number you used in chat. No password.
                </p>
              </div>
              <button
                onClick={handleCloseAuthModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer min-w-[36px] min-h-[36px]"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleContactLoginSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="input-label">Your mobile number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={contactLoginInput}
                  onChange={(e) => setContactLoginInput(e.target.value)}
                  placeholder="e.g. +971 50 123 4567"
                  className="input-field text-xs py-2.5"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting || !contactLoginInput.trim()}
                className="btn-primary w-full py-2.5 text-xs font-semibold mt-2 shadow-lg shadow-brand-500/25 cursor-pointer disabled:opacity-50"
              >
                {authSubmitting ? 'Logging in…' : 'Open my chats'}
              </button>
            </form>

            <p className="mt-4 text-[11px] text-surface-500 text-center">
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
                  placeholder="e.g. Ahmed or Rahul"
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

            <div className="mb-4">
              <InstallPrompt armed forceVisible compact />
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
                      ? '+971 50xxx or +91 98xxx'
                      : verificationMethod === 'phone'
                      ? '+971 50xxx or +91 98xxx'
                      : '@username or +92 3xx'
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

      <InstallPrompt
        armed={replyArrived || firstMessageSent}
        senderName={replySenderName}
      />
    </PullToRefresh>
  );
}
