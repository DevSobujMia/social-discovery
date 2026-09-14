'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Shield,
  MessageSquare,
  BarChart3,
  UserCheck,
  Megaphone,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Send,
  Plus,
  Copy,
  ChevronRight,
  UserX,
  LogOut,
  Sliders,
  Check,
  ChevronLeft,
  X,
  Phone,
  MessageCircle,
  ShieldCheck,
  BadgeCheck,
  Cake,
  Plane,
  Camera,
  CheckCheck,
  Sparkles,
  Upload,
  Trash2,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Smartphone,
  Monitor,
  Tablet,
} from 'lucide-react';
import {
  COUNTRY_CITIES,
  POPULAR_COUNTRIES,
  DESTINATION_PHOTOS,
  TIMING_OPTIONS,
} from '@/components/PostTravelPlanModal';
import {
  chatBubbleTime,
  chatListTime,
  DayChip,
  dayLabel,
  MessageTicks,
  sameCalendarDay,
} from '../components/messaging';

type LeadContactChannel = 'phone' | 'whatsapp' | 'telegram';

/**
 * Contact strings are typed by hand by visitors, so they arrive in every shape:
 * "+8801711-223344", "01711 223344", "@sobuj", "https://t.me/sobuj".
 * These helpers normalise them into links the operator can click straight from the CRM.
 */
function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function telHref(value: string): string {
  const digits = digitsOf(value);
  return `tel:${value.trim().startsWith('+') ? '+' : ''}${digits}`;
}

function whatsappHref(value: string): string {
  return `https://wa.me/${digitsOf(value)}`;
}

function telegramHref(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  // A Telegram identity is either a username or a phone number; t.me only routes usernames.
  if (/^[0-9+\-\s()]+$/.test(handle)) return `https://t.me/+${digitsOf(handle)}`;
  return `https://t.me/${handle}`;
}

function contactHref(channel: LeadContactChannel, value: string): string {
  if (channel === 'phone') return telHref(value);
  if (channel === 'whatsapp') return whatsappHref(value);
  return telegramHref(value);
}

export default function AdminDashboardPage() {
  // Staff auth state
  const [currentStaff, setCurrentStaff] = useState<any>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'inbox' | 'trips' | 'campaigns' | 'reports'>('inbox');

  // Analytics data
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Users data
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [leadStageFilter, setLeadStageFilter] = useState<'' | 'complete' | 'incomplete'>('');
  const [copiedContact, setCopiedContact] = useState<string | null>(null);
  const [expandedDeviceLeadId, setExpandedDeviceLeadId] = useState<string | null>(null);

  const [travelPlans, setTravelPlans] = useState<any[]>([]);
  const [curatedProfiles, setCuratedProfiles] = useState<any[]>([]);
  const [tripForm, setTripForm] = useState({
    profileId: '',
    country: 'United Arab Emirates',
    city: 'Dubai',
    customCountry: '',
    customCity: '',
    timing: 'coming_soon',
    fromDate: '',
    toDate: '',
    note: 'Traveling soon · looking for local company',
    photoUrl: DESTINATION_PHOTOS['Dubai'] || '',
  });
  const [uploadingTripPhoto, setUploadingTripPhoto] = useState(false);
  const tripPhotoFileRef = useRef<HTMLInputElement>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    age: '24',
    gender: 'female',
    country: 'United Kingdom',
    city: 'London',
    bio: '',
    interests: 'Travel, Cafes, Photography',
    photoUrl: '',
    travelCity: 'Dubai',
    travelNote: 'Traveling soon to Dubai.',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const profilePhotoFileRef = useRef<HTMLInputElement>(null);

  // Master Inbox
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [staffReplyInput, setStaffReplyInput] = useState('');
  const [sendOnBehalf, setSendOnBehalf] = useState(false);
  const [sendingStaffReply, setSendingStaffReply] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'chats' | 'all'>('chats'); // 'chats' is default: only show active conversations with messages
  const [inboxSearch, setInboxSearch] = useState('');
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const adminMediaInputRef = useRef<HTMLInputElement>(null);
  const adminTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadingAdminMedia, setUploadingAdminMedia] = useState(false);
  const selectedChatRef = useRef(selectedChat);
  selectedChatRef.current = selectedChat;

  const currentStaffRef = useRef(currentStaff);
  currentStaffRef.current = currentStaff;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Campaigns
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  const [newCampName, setNewCampName] = useState('');
  const [newCampPlatform, setNewCampPlatform] = useState('facebook');
  const [newCampUtmCampaign, setNewCampUtmCampaign] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Reports
  const [reports, setReports] = useState<any[]>([]);

  // Toast / Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch current authenticated staff
  const fetchStaffSession = useCallback(async () => {
    try {
      setLoadingStaff(true);
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      // Staff session is independent of any guest/user cookie on this browser.
      if (data.success && data.data?.staff) {
        setCurrentStaff(data.data.staff);
      } else {
        setCurrentStaff(null);
      }
    } catch {
      setCurrentStaff(null);
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    fetchStaffSession();
  }, [fetchStaffSession]);

  // Handle Desktop Escape Key for Admin Modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNewCampaignModal) setShowNewCampaignModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewCampaignModal]);

  // Staff login handler
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (data.success && data.data?.staff) {
        setCurrentStaff(data.data.staff);
        loadAllData();
      } else {
        setLoginError(data.error?.message || 'Invalid staff credentials');
      }
    } catch {
      setLoginError('Error connecting to authentication server');
    } finally {
      setLoggingIn(false);
    }
  };

  // Staff logout
  const handleStaffLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'staff' }),
    });
    setCurrentStaff(null);
  };

  // Data fetching functions
  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await fetch('/api/admin/analytics');
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const params = new URLSearchParams();
      if (userSearch) params.set('search', userSearch);
      if (userStatusFilter) params.set('status', userStatusFilter);
      params.set('limit', '100');
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setUsersList(data.data?.users || (Array.isArray(data.data) ? data.data : []));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTravelPlans = async () => {
    try {
      const [plansRes, usersRes] = await Promise.all([
        fetch('/api/admin/travel-plans?includePast=true'),
        fetch('/api/admin/users?ownerType=staff_assisted&limit=100'),
      ]);
      const plansData = await plansRes.json();
      const usersData = await usersRes.json();
      if (plansData.success) {
        setTravelPlans(Array.isArray(plansData.data) ? plansData.data : []);
      }
      if (usersData.success) {
        const list = usersData.data?.users || [];
        setCuratedProfiles(list.filter((u: any) => u.profileOwnerType === 'staff_assisted' && u.displayName));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadProfilePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProfilePhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'curated_profile');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && (data.data?.url || data.data?.filePath)) {
        const url = data.data.url || data.data.filePath;
        setProfileForm((prev) => ({ ...prev, photoUrl: url }));
        showToast('Photo uploaded successfully');
      } else {
        showToast(data.error?.message || 'Could not upload photo');
      }
    } catch {
      showToast('Could not upload photo');
    } finally {
      setUploadingProfilePhoto(false);
      if (profilePhotoFileRef.current) profilePhotoFileRef.current.value = '';
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.displayName.trim()) {
      showToast('Display name is required');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profileForm.displayName.trim(),
          age: profileForm.age ? parseInt(String(profileForm.age), 10) : undefined,
          gender: profileForm.gender,
          country: profileForm.country,
          city: profileForm.city,
          bio: profileForm.bio,
          interests: profileForm.interests,
          lookingFor: 'travel_partner',
          photoUrl: profileForm.photoUrl.trim() || undefined,
          travelCity: profileForm.travelCity,
          travelNote: profileForm.travelNote || `Traveling soon to ${profileForm.travelCity}.`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Created ${profileForm.displayName} · traveling soon to ${profileForm.travelCity}`);
        setProfileForm({
          displayName: '',
          age: '24',
          gender: 'female',
          country: 'United Kingdom',
          city: 'London',
          bio: '',
          interests: 'Travel, Cafes, Photography',
          photoUrl: '',
          travelCity: 'Dubai',
          travelNote: 'Traveling soon to Dubai.',
        });
        fetchTravelPlans();
      } else {
        showToast(data.error?.message || 'Could not create profile');
      }
    } catch {
      showToast('Could not create profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCountryChangeForTrip = (newCountry: string) => {
    const firstCity =
      newCountry !== 'Other' && COUNTRY_CITIES[newCountry]?.length > 0
        ? COUNTRY_CITIES[newCountry][0]
        : 'Other';
    setTripForm((prev) => ({
      ...prev,
      country: newCountry,
      city: firstCity,
      photoUrl: DESTINATION_PHOTOS[firstCity] || prev.photoUrl,
    }));
  };

  const handleCityChangeForTrip = (newCity: string) => {
    setTripForm((prev) => ({
      ...prev,
      city: newCity,
      photoUrl: DESTINATION_PHOTOS[newCity] || prev.photoUrl,
    }));
  };

  const handleUploadTripPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTripPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setTripForm((prev) => ({ ...prev, photoUrl: data.data.url }));
        showToast('Trip photo uploaded! 📷');
      } else {
        showToast(data.error?.message || 'Could not upload photo');
      }
    } catch {
      showToast('Could not upload photo');
    } finally {
      setUploadingTripPhoto(false);
      if (tripPhotoFileRef.current) tripPhotoFileRef.current.value = '';
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripForm.profileId) {
      showToast('Please select a curated profile');
      return;
    }

    const effectiveCountry = tripForm.country === 'Other' ? tripForm.customCountry.trim() : tripForm.country;
    const effectiveCity = tripForm.city === 'Other' ? tripForm.customCity.trim() : tripForm.city;

    if (!effectiveCountry || !effectiveCity) {
      showToast('Please specify both destination country and city');
      return;
    }

    if (tripForm.timing === 'custom') {
      if (!tripForm.fromDate || !tripForm.toDate) {
        showToast('Pick both arrival and departure dates for custom timing');
        return;
      }
      if (new Date(tripForm.fromDate) > new Date(tripForm.toDate)) {
        showToast('Departure date cannot be before arrival date');
        return;
      }
    }

    setSavingTrip(true);
    try {
      const res = await fetch('/api/admin/travel-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: tripForm.profileId,
          country: effectiveCountry,
          city: effectiveCity,
          timing: tripForm.timing,
          fromDate: tripForm.timing === 'custom' ? tripForm.fromDate : undefined,
          toDate: tripForm.timing === 'custom' ? tripForm.toDate : undefined,
          note: tripForm.note.trim() || undefined,
          photoUrl: tripForm.photoUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Trip to ${effectiveCity} added! Visitors in ${effectiveCity} will match her ✈`);
        setTripForm((prev) => ({
          ...prev,
          fromDate: '',
          toDate: '',
          note: 'Traveling soon · looking for local company',
          photoUrl: DESTINATION_PHOTOS[effectiveCity] || '',
        }));
        fetchTravelPlans();
      } else {
        showToast(data.error?.message || 'Could not save trip');
      }
    } catch {
      showToast('Could not save trip');
    } finally {
      setSavingTrip(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    setDeletingTripId(id);
    try {
      const res = await fetch(`/api/admin/travel-plans?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Trip plan removed');
        setTravelPlans((prev) => prev.filter((p) => p.id !== id));
      } else {
        showToast(data.error?.message || 'Could not remove trip');
      }
    } catch {
      showToast('Could not remove trip');
    } finally {
      setDeletingTripId(null);
    }
  };

  const fetchMasterInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/conversations', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        const list = data.data?.conversations || (Array.isArray(data.data) ? data.data : []);
        const openId = selectedChatRef.current?.id;
        const normalized = list
          .map((c: any) => (openId && c.id === openId ? { ...c, totalUnread: 0 } : c))
          .sort(
            (a: any, b: any) =>
              new Date(b.lastMessageAt || b.updatedAt || 0).getTime() -
              new Date(a.lastMessageAt || a.updatedAt || 0).getTime()
          );
        setConversations(normalized);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchMasterInboxRef = useRef(fetchMasterInbox);
  fetchMasterInboxRef.current = fetchMasterInbox;

  const fetchChatMessages = useCallback(async (id: string, isSilent = false) => {
    try {
      const res = await fetch(`/api/admin/conversations/${id}/messages`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (selectedChatRef.current?.id !== id) return;
      if (data.success && Array.isArray(data.data?.messages)) {
        setChatMessages(data.data.messages);
        if (!isSilent) {
          setTimeout(() => {
            chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 60);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchChatMessagesRef = useRef(fetchChatMessages);
  fetchChatMessagesRef.current = fetchChatMessages;

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/admin/conversations/mark-all-read', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setConversations((prev) => prev.map((c) => ({ ...c, totalUnread: 0 })));
        showToast('All conversations marked as read! ✓');
        fetchMasterInbox();
      } else {
        showToast(data.error?.message || 'Failed to mark conversations as read');
      }
    } catch {
      showToast('Failed to mark conversations as read');
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.success) {
        setCampaigns(Array.isArray(data.data) ? data.data : (data.data?.campaigns || []));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/admin/reports');
      const data = await res.json();
      if (data.success) {
        setReports(Array.isArray(data.data) ? data.data : (data.data?.reports || []));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllData = useCallback(() => {
    fetchAnalytics();
    fetchUsers();
    fetchMasterInbox();
    fetchCampaigns();
    fetchReports();
    fetchTravelPlans();
  }, [userSearch, userStatusFilter]);

  useEffect(() => {
    if (currentStaff) {
      loadAllData();
    }
  }, [currentStaff, loadAllData]);

  // A lead counts as complete once any one contact channel has been verified.
  const isCompleteLead = useCallback(
    (u: any) => u?.isVerifiedLead === true || u?.leadStage === 'complete',
    []
  );

  const leadCounts = useMemo(
    () => ({
      all: usersList.length,
      complete: usersList.filter(isCompleteLead).length,
      incomplete: usersList.filter((u) => !isCompleteLead(u)).length,
    }),
    [usersList, isCompleteLead]
  );

  const visibleLeads = useMemo(() => {
    if (leadStageFilter === 'complete') return usersList.filter(isCompleteLead);
    if (leadStageFilter === 'incomplete') return usersList.filter((u) => !isCompleteLead(u));
    return usersList;
  }, [usersList, leadStageFilter, isCompleteLead]);

  const handleCopyContact = useCallback((value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedContact(value);
        setTimeout(() => setCopiedContact((c) => (c === value ? null : c)), 1800);
      })
      .catch(() => setToastMessage('Could not copy to clipboard'));
  }, []);

  // Check if conversation has any message
  const hasMessages = useCallback((c: any) => {
    return !!(
      c.lastMessagePreview ||
      c.lastMessage ||
      c.lastMessageAt ||
      (Array.isArray(c.messages) && c.messages.length > 0)
    );
  }, []);

  // Filtered conversations based on Chat List vs All Users & Search
  const filteredConversations = useMemo(() => {
    return conversations
      .filter((c) => {
        // 1. Chat List toggle: only show active conversations with messages
        if (inboxFilter === 'chats' && !hasMessages(c)) {
          return false;
        }
        // 2. Search query filter
        if (inboxSearch.trim()) {
          const q = inboxSearch.toLowerCase();
          const custName = (c.customer?.displayName || '').toLowerCase();
          const custEmail = (c.customer?.email || '').toLowerCase();
          const profName = (c.representedProfile?.displayName || '').toLowerCase();
          const preview = (c.lastMessagePreview || '').toLowerCase();
          if (!custName.includes(q) && !custEmail.includes(q) && !profName.includes(q) && !preview.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const timeOf = (c: any) => {
          const t = new Date(c.lastMessageAt || c.updatedAt || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        // Newest chat activity always on top.
        return timeOf(b) - timeOf(a);
      });
  }, [conversations, inboxFilter, inboxSearch, hasMessages]);

  const activeChatsCount = useMemo(() => conversations.filter(hasMessages).length, [conversations, hasMessages]);
  const allConversationsCount = conversations.length;
  const totalInboxUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.totalUnread || 0), 0),
    [conversations]
  );

  const formatInboxTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Mobile Back & Escape Key Sync for Master Inbox
  const handleSelectConversation = (c: any) => {
    setSelectedChat(c);
    // Clear unread badge instantly; server clears on GET messages.
    setConversations((prev) =>
      prev.map((row) => (row.id === c.id ? { ...row, totalUnread: 0 } : row))
    );
    if (typeof window !== 'undefined') {
      window.history.pushState({ adminChatId: c.id }, '', window.location.href);
    }
  };

  const handleCloseSelectedChat = () => {
    setSelectedChat(null);
  };

  useEffect(() => {
    const handleAdminPopState = () => {
      if (selectedChatRef.current) {
        setSelectedChat(null);
      }
    };
    window.addEventListener('popstate', handleAdminPopState);
    return () => window.removeEventListener('popstate', handleAdminPopState);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedChatRef.current) {
        setSelectedChat(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch once when opening a thread; live updates come from the stable poll below.
  useEffect(() => {
    if (!selectedChat) return;
    fetchChatMessagesRef.current(selectedChat.id);
  }, [selectedChat]);

  // Single message poll — empty deps so Fast Refresh cannot stack timers.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const chatId = selectedChatRef.current?.id;
      if (chatId && !(typeof document !== 'undefined' && document.hidden)) {
        await fetchChatMessagesRef.current(chatId, true);
      }
      if (!stopped) timer = setTimeout(tick, 2500);
    };

    timer = setTimeout(tick, 2500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Live inbox list — only while staff is on the Inbox tab.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (
        currentStaffRef.current &&
        activeTabRef.current === 'inbox' &&
        !(typeof document !== 'undefined' && document.hidden)
      ) {
        await fetchMasterInboxRef.current();
      }
      if (!stopped) timer = setTimeout(tick, 3000);
    };

    timer = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Send staff reply with instant optimistic UI (text, photo, or video)
  const handleSendStaffReply = async (
    e?: React.FormEvent,
    mediaData?: { mediaUrl: string; contentType: string }
  ) => {
    if (e) e.preventDefault();
    if (!selectedChat || sendingStaffReply || uploadingAdminMedia) return;

    const content = staffReplyInput.trim();
    if (!content && !mediaData?.mediaUrl) return;

    const effectiveContentType = mediaData?.contentType || 'text';
    const effectiveMediaUrl = mediaData?.mediaUrl || null;
    const effectiveContent = content || (effectiveContentType === 'video' ? '📹 Video' : effectiveContentType === 'image' ? '📷 Photo' : '');

    setStaffReplyInput('');
    if (adminTextareaRef.current) {
      adminTextareaRef.current.style.height = 'auto';
    }
    setSendingStaffReply(true);

    const representedProfileId = selectedChat.representedProfile?.userId
      || selectedChat.participants?.find((p: any) => p.user?.profileOwnerType === 'staff_assisted')?.userId
      || selectedChat.representedProfileUserId;

    const representedName = selectedChat.representedProfile?.displayName || 'Maya';
    const operatorRaw = currentStaff?.displayName;
    const cleanOperator = (operatorRaw === 'System Administrator' || currentStaff?.role === 'admin') ? 'Admin' : (operatorRaw || 'Admin');

    // Optimistic local message insertion
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      content: effectiveContent,
      contentType: effectiveContentType,
      mediaUrl: effectiveMediaUrl,
      senderStaffId: currentStaff?.id,
      senderStaff: { displayName: currentStaff?.displayName },
      senderName: `${representedName} (${cleanOperator})`,
      isAssisted: true,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) => {
      const now = new Date().toISOString();
      return [...prev]
        .map((c) =>
          c.id === selectedChat.id
            ? { ...c, lastMessageAt: now, lastMessagePreview: effectiveContent, totalUnread: 0 }
            : c
        )
        .sort(
          (a, b) =>
            new Date(b.lastMessageAt || b.updatedAt || 0).getTime() -
            new Date(a.lastMessageAt || a.updatedAt || 0).getTime()
        );
    });
    setTimeout(() => {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 40);

    try {
      const payload = {
        content: effectiveContent,
        contentType: effectiveContentType,
        mediaUrl: effectiveMediaUrl,
        sentOnBehalfOf: representedProfileId,
        onBehalfOfUserId: representedProfileId,
      };

      const res = await fetch(`/api/admin/conversations/${selectedChat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        fetchChatMessages(selectedChat.id, true);
        fetchMasterInbox();
        showToast(`Reply sent on behalf of ${representedName}! 💬`);
      } else {
        // Rollback optimistic message on error
        setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
        showToast(data.error?.message || 'Failed to send reply');
      }
    } catch (e) {
      console.error(e);
      setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast('Network error while sending reply');
    } finally {
      setSendingStaffReply(false);
      setTimeout(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  };

  const handleAdminMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;
    e.target.value = '';

    setUploadingAdminMedia(true);
    showToast('Uploading media… ⏳');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/chat-media', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        await handleSendStaffReply(undefined, {
          mediaUrl: data.data.url,
          contentType: data.data.contentType || (file.type.startsWith('video/') ? 'video' : 'image'),
        });
      } else {
        showToast(data.error?.message || 'Failed to upload media');
      }
    } catch {
      showToast('Failed to upload file. Please try again.');
    } finally {
      setUploadingAdminMedia(false);
    }
  };

  // Toggle user status (suspend / activate)
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`User status updated to ${nextStatus}`);
        fetchUsers();
        fetchAnalytics();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName,
          platform: newCampPlatform,
          utmSource: newCampPlatform,
          utmMedium: 'cpc',
          utmCampaign: newCampUtmCampaign,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Ad campaign created! 📣');
        setShowNewCampaignModal(false);
        setNewCampName('');
        setNewCampUtmCampaign('');
        fetchCampaigns();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Copy campaign share link
  const handleCopyLink = (utmCampaign: string) => {
    const link = `${window.location.origin}/?utm_source=facebook&utm_medium=cpc&utm_campaign=${utmCampaign}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(utmCampaign);
    showToast('Ad URL copied to clipboard! 📋');
    setTimeout(() => setCopiedLink(null), 2500);
  };

  if (loadingStaff) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-accent-teal border-t-transparent animate-spin" />
      </div>
    );
  }

  // If not logged in as staff, show login / persona picker
  if (!currentStaff) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 font-sans text-white">
        <div className="w-full max-w-md glass-card p-8 border-surface-700">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-teal to-blue-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Heartlink Admin</h1>
              <p className="text-xs text-surface-400">Direct Administrator Control Portal</p>
            </div>
          </div>

          {loginError && (
            <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {loginError}
            </div>
          )}

          <form onSubmit={handleStaffLogin} className="space-y-3.5 text-xs">
            <div>
              <label className="input-label">Admin Email</label>
              <input
                type="email"
                required
                autoComplete="username"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
                className="input-field text-xs py-2.5"
              />
            </div>
            <div>
              <label className="input-label">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field text-xs py-2.5"
              />
            </div>
            <button
              type="submit"
              disabled={loggingIn}
              className="btn-primary w-full py-2.5 text-xs font-semibold mt-2"
            >
              {loggingIn ? 'Authenticating...' : 'Sign In as Administrator'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-xs text-surface-400 hover:text-white flex items-center justify-center gap-1">
              <span>← Back to Public App</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 text-white font-sans flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-slide-up">
          <div className="bg-surface-800 border border-accent-teal/50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-accent-teal" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Top Staff Navbar */}
      <header className="sticky top-0 z-30 bg-surface-900/90 backdrop-blur-xl border-b border-surface-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-teal to-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">Heartlink Admin</h1>
                <span className="badge-teal text-[10px] uppercase font-bold px-2 py-0.5">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-surface-400">
                Direct Mode • <strong className="text-white">{currentStaff?.displayName || 'Administrator'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/simulator"
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-accent-teal hover:from-brand-400 hover:to-accent-teal/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-brand-500/20 transition"
              title="Launch Real Ads & Customer Journey Simulator"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Ads Simulator</span>
            </Link>

            <Link
              href="/"
              target="_blank"
              className="btn-ghost py-1.5 px-3 rounded-lg text-xs flex items-center gap-1"
            >
              <span>View User App</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <button
              onClick={handleStaffLogout}
              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-red-400 border border-surface-700 transition"
              title="Logout administrator"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main CRM Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:py-6 flex flex-col md:flex-row gap-6">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <button
            onClick={() => {
              setActiveTab('inbox');
              fetchMasterInbox();
            }}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 relative ${
              activeTab === 'inbox'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Master Inbox</span>
            {totalInboxUnread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-surface-950 text-[10px] font-bold flex items-center justify-center">
                {totalInboxUnread > 9 ? '9+' : totalInboxUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Dashboard & KPIs</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === 'users'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Management</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('trips');
              fetchTravelPlans();
            }}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === 'trips'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Plane className="w-4 h-4" />
            <span>Travel Plans</span>
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === 'campaigns'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>Campaigns & Tracking</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === 'reports'
                ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/30'
                : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Moderation & Reports</span>
          </button>

          <Link
            href="/simulator"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition shrink-0 mt-2 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Ads Simulator 🚀</span>
          </Link>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* ============================================================ */}
          {/* 1. DASHBOARD & KPIS                                          */}
          {/* ============================================================ */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Platform KPIs & Live Funnel</h2>
                  <p className="text-xs text-surface-400">
                    Real-time usage data, ad traffic conversions, and direct customer engagement.
                  </p>
                </div>
                <button
                  onClick={fetchAnalytics}
                  className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white border border-surface-700 transition"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                  <p className="text-[11px] text-surface-400 font-medium">Total Registered Users</p>
                  <p className="text-2xl font-extrabold text-white mt-1">
                    {analytics?.overview?.totalUsers ?? '...'}
                  </p>
                  <span className="text-[10px] text-accent-teal mt-1 inline-block">Active Leads</span>
                </div>

                <div className="glass-card p-4">
                  <p className="text-[11px] text-surface-400 font-medium">Signups Today</p>
                  <p className="text-2xl font-extrabold text-brand-400 mt-1">
                    {analytics?.overview?.newUsersToday ?? 0}
                  </p>
                  <span className="text-[10px] text-surface-500 mt-1 inline-block">24h Volume</span>
                </div>

                <div className="glass-card p-4">
                  <p className="text-[11px] text-surface-400 font-medium">Active Conversations</p>
                  <p className="text-2xl font-extrabold text-indigo-400 mt-1">
                    {analytics?.overview?.activeConversations ?? '...'}
                  </p>
                  <span className="text-[10px] text-surface-500 mt-1 inline-block">Direct & Assisted</span>
                </div>

                <div className="glass-card p-4">
                  <p className="text-[11px] text-surface-400 font-medium">Total Messages Sent</p>
                  <p className="text-2xl font-extrabold text-accent-amber mt-1">
                    {analytics?.overview?.totalMessages ?? '...'}
                  </p>
                  <span className="text-[10px] text-surface-500 mt-1 inline-block">High Engagement</span>
                </div>
              </div>

              {/* Direct Operations & Campaign Attribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Admin Direct Operations Card */}
                <div className="glass-card p-5">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accent-teal" />
                    <span>Direct Admin Operations</span>
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">Direct Chat Operation</span>
                        <span className="badge-teal text-[10px] font-bold">Active</span>
                      </div>
                      <p className="text-[11px] text-surface-400">
                        Admin replies directly on behalf of managed profiles. Customers see genuine profile responses without agent delegation.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">Master Inbox</p>
                        <p className="text-[10px] text-surface-400">Two-tab organization (Chat List vs All Users)</p>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('inbox');
                          fetchMasterInbox();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-accent-teal font-semibold text-xs border border-surface-700 transition"
                      >
                        Open Inbox
                      </button>
                    </div>
                  </div>
                </div>

                {/* Campaign Breakdown */}
                <div className="glass-card p-5">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-brand-400" />
                    <span>Ad Attribution & Campaigns</span>
                  </h3>
                  <div className="space-y-3">
                    {campaigns.length === 0 ? (
                      <p className="text-xs text-surface-500">No active ad campaigns yet</p>
                    ) : (
                      campaigns.map((camp) => (
                        <div
                          key={camp.id}
                          className="p-3 rounded-xl bg-surface-900/60 border border-surface-800 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-bold text-white">{camp.name}</p>
                            <p className="text-[10px] text-surface-400 font-mono">
                              utm_campaign={camp.utmCampaign}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="badge-brand text-xs font-semibold px-2 py-0.5">
                              {camp.leadsCount || 0} Leads
                            </span>
                            <button
                              onClick={() => handleCopyLink(camp.utmCampaign)}
                              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white transition"
                              title="Copy ad link"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 2. USER MANAGEMENT                                           */}
          {/* ============================================================ */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Lead Collection</h2>
                  <p className="text-[11px] text-surface-400 mt-0.5">
                    Every ad visitor lands here — verified contacts are one click away.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search name, phone, WhatsApp, Telegram..."
                      className="input-field text-xs py-1.5 pl-8"
                    />
                  </div>
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value)}
                    className="input-field text-xs py-1.5 w-32"
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <button
                    onClick={fetchUsers}
                    className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-white transition cursor-pointer shrink-0"
                    title="Refresh leads"
                    aria-label="Refresh leads"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Lead stage segmented control */}
              <div className="grid grid-cols-3 p-1 rounded-xl bg-surface-950 border border-surface-800 text-xs font-medium max-w-lg">
                {([
                  { key: '', label: 'All Leads', icon: Users },
                  { key: 'complete', label: 'Complete', icon: BadgeCheck },
                  { key: 'incomplete', label: 'Incomplete', icon: Clock },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key || 'all'}
                    type="button"
                    onClick={() => setLeadStageFilter(key)}
                    className={`py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      leadStageFilter === key
                        ? 'bg-accent-teal text-surface-950 font-bold shadow-md'
                        : 'text-surface-400 hover:text-white hover:bg-surface-800/40'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    <span
                      className={`text-[10px] px-1.5 rounded-full font-bold ${
                        leadStageFilter === key
                          ? 'bg-surface-950/20 text-surface-950'
                          : 'bg-surface-800 text-surface-300'
                      }`}
                    >
                      {key === '' ? leadCounts.all : key === 'complete' ? leadCounts.complete : leadCounts.incomplete}
                    </span>
                  </button>
                ))}
              </div>

              {/* Users Table */}
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-surface-300">
                    <thead className="bg-surface-900 text-[11px] uppercase text-surface-400 border-b border-surface-800">
                      <tr>
                        <th className="p-3">Lead</th>
                        <th className="p-3">Requirements</th>
                        <th className="p-3">Verification</th>
                        <th className="p-3">Direct Contact</th>
                        <th className="p-3">Device</th>
                        <th className="p-3">Source</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/60">
                      {visibleLeads.map((u) => {
                        const photo = u.photo || u.profile?.photos?.[0]?.filePath;
                        const displayName = u.displayName || u.profile?.displayName || 'Anonymous Lead';
                        const country = u.country || u.profile?.country || '—';
                        const gender = u.gender || u.profile?.gender || '—';
                        const lookingFor =
                          u.requirements?.preferredGender ||
                          u.lookingFor ||
                          u.profile?.lookingFor;
                        const complete = isCompleteLead(u);
                        const device = u.device;
                        const deviceOpen = expandedDeviceLeadId === u.id;
                        const DeviceIcon =
                          device?.fields?.find((f: { key: string }) => f.key === 'Device')?.value ===
                          'desktop'
                            ? Monitor
                            : device?.fields?.find((f: { key: string }) => f.key === 'Device')
                                  ?.value === 'tablet'
                              ? Tablet
                              : Smartphone;
                        const channels = ([
                          { channel: 'phone' as const, value: u.phone, label: 'Call', Icon: Phone, tone: 'text-sky-300 border-sky-500/30 hover:bg-sky-500/10' },
                          { channel: 'whatsapp' as const, value: u.whatsapp, label: 'WhatsApp', Icon: MessageCircle, tone: 'text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10' },
                          { channel: 'telegram' as const, value: u.telegram, label: 'Telegram', Icon: Send, tone: 'text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/10' },
                        ]).filter((c) => typeof c.value === 'string' && c.value.trim().length > 0);

                        return (
                          <React.Fragment key={u.id}>
                          <tr className="hover:bg-surface-800/40 transition">
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-700 shrink-0">
                                  {photo ? (
                                    <img src={photo} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-white">
                                      {displayName?.[0] || 'U'}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-white flex items-center gap-1.5">
                                    {displayName}
                                    {u.age ? (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-surface-400">
                                        <Cake className="w-3 h-3" />
                                        {u.age}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-[10px] text-surface-400">
                                    {u.email || u.phone || u.whatsapp || u.telegram || 'No contact yet'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="p-3">
                              <span className="badge-brand text-[10px] capitalize">
                                {typeof lookingFor === 'string'
                                  ? lookingFor.replace(/_/g, ' ')
                                  : 'Not specified'}
                              </span>
                              <p className="text-[10px] text-surface-400 mt-1 capitalize">
                                {gender} · {country}
                                {u.requirements?.travelDestination
                                  ? ` · ${u.requirements.travelDestination}`
                                  : ''}
                              </p>
                            </td>

                            <td className="p-3">
                              {complete ? (
                                <span className="badge-teal text-[10px] font-bold">
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  Complete
                                </span>
                              ) : (
                                <span className="badge-amber text-[10px] font-bold">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Incomplete
                                </span>
                              )}
                              {u.verifiedVia ? (
                                <p className="text-[10px] text-surface-400 mt-1 capitalize">via {u.verifiedVia}</p>
                              ) : null}
                            </td>

                            <td className="p-3">
                              {channels.length === 0 ? (
                                <span className="text-[10px] text-surface-500 italic">Awaiting verification</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {channels.map(({ channel, value, label, Icon, tone }) => (
                                    <span key={channel} className="inline-flex items-center">
                                      <a
                                        href={contactHref(channel, value)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`${label}: ${value}`}
                                        className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium border rounded-l-lg transition cursor-pointer ${tone}`}
                                      >
                                        <Icon className="w-3 h-3" />
                                        <span className="hidden lg:inline">{label}</span>
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyContact(value)}
                                        title={`Copy ${value}`}
                                        aria-label={`Copy ${label} contact`}
                                        className={`inline-flex items-center px-1.5 py-1 border border-l-0 rounded-r-lg transition cursor-pointer ${tone}`}
                                      >
                                        {copiedContact === value ? (
                                          <Check className="w-3 h-3" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDeviceLeadId((id) => (id === u.id ? null : u.id))
                                }
                                className="text-left max-w-[200px] group cursor-pointer"
                                title={device?.qualityNote || 'Device details'}
                              >
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white">
                                  <DeviceIcon className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-300" />
                                  <span className="truncate">{device?.label || 'Unknown device'}</span>
                                </span>
                                <p className="text-[10px] text-surface-400 mt-0.5 truncate">
                                  {device?.detail || 'Tap for details'}
                                </p>
                                {device?.quality && device.quality !== 'unknown' ? (
                                  <span
                                    className={`mt-1 inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                      device.quality === 'strong'
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : device.quality === 'weak'
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : 'bg-surface-800 text-surface-400'
                                    }`}
                                  >
                                    {device.quality === 'strong'
                                      ? 'Good signal'
                                      : device.quality === 'weak'
                                        ? 'In-app / caution'
                                        : 'Neutral'}
                                  </span>
                                ) : null}
                              </button>
                            </td>

                            <td className="p-3">
                              {u.source?.utm_campaign ? (
                                <>
                                  <span className="badge text-[10px] bg-brand-500/15 text-brand-300 font-medium">
                                    <Megaphone className="w-3 h-3 mr-1" />
                                    {u.source.utm_campaign}
                                  </span>
                                  {u.source.utm_source ? (
                                    <p className="text-[10px] text-surface-400 mt-1 capitalize">{u.source.utm_source}</p>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-[10px] text-surface-500 italic">Direct</span>
                              )}
                            </td>

                            <td className="p-3">
                              <span
                                className={`badge text-[10px] font-bold ${
                                  u.status === 'active'
                                    ? 'bg-accent-teal/20 text-accent-teal'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {u.status}
                              </span>
                            </td>

                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleToggleUserStatus(u.id, u.status)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                                    u.status === 'active'
                                      ? 'text-red-400 hover:bg-red-500/10 border border-red-500/30'
                                      : 'text-accent-teal hover:bg-teal-500/10 border border-accent-teal/30'
                                  }`}
                                >
                                  {u.status === 'active' ? 'Suspend' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {deviceOpen ? (
                            <tr className="bg-surface-950/80">
                              <td colSpan={8} className="px-4 py-3">
                                <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-3">
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                      <p className="text-xs font-bold text-white">Device & quality</p>
                                      <p className="text-[11px] text-surface-400 mt-0.5">
                                        {device?.qualityNote || 'No quality note'}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedDeviceLeadId(null)}
                                      className="text-[11px] text-surface-400 hover:text-white cursor-pointer"
                                    >
                                      Close
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {(device?.fields || []).map(
                                      (f: { key: string; value: string }) => (
                                        <div
                                          key={f.key}
                                          className="rounded-lg bg-surface-950/70 border border-surface-800 px-2.5 py-2"
                                        >
                                          <p className="text-[9px] uppercase tracking-wide text-surface-500">
                                            {f.key}
                                          </p>
                                          <p className="text-[11px] text-surface-200 mt-0.5 break-all">
                                            {f.value}
                                          </p>
                                        </div>
                                      )
                                    )}
                                    {(!device?.fields || device.fields.length === 0) && (
                                      <p className="text-[11px] text-surface-500 col-span-full">
                                        Device snapshot will appear after the visitor opens chat or returns.
                                      </p>
                                    )}
                                  </div>
                                  {u.geoCity || u.geoCountry || u.language ? (
                                    <p className="text-[10px] text-surface-500 mt-2">
                                      Edge geo: {[u.geoCity, u.geoCountry].filter(Boolean).join(', ') || '—'}
                                      {u.language ? ` · lang ${u.language}` : ''}
                                      {typeof u.leadScore === 'number' ? ` · score ${u.leadScore}` : ''}
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                          </React.Fragment>
                        );
                      })}

                      {!loadingUsers && visibleLeads.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-10 text-center">
                            <UserCheck className="w-8 h-8 mx-auto text-surface-600 mb-2" />
                            <p className="text-surface-300 font-medium">No leads in this view</p>
                            <p className="text-[11px] text-surface-500 mt-1">
                              {leadStageFilter === 'complete'
                                ? 'Nobody has verified a contact yet.'
                                : leadStageFilter === 'incomplete'
                                  ? 'Every lead here has verified their contact.'
                                  : 'Leads appear the moment an ad visitor starts a chat.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 4. MASTER INBOX & ASSISTED CHAT                              */}
          {/* ============================================================ */}
          {activeTab === 'inbox' && (
            <div className="glass-card overflow-hidden h-[calc(100dvh-7.5rem)] min-h-[560px] md:h-[720px] max-h-[850px] flex flex-col md:flex-row border border-surface-800/80 shadow-2xl rounded-2xl">
              {/* Thread list Sidebar */}
              <div className={`w-full md:w-96 border-r border-surface-800 flex flex-col h-full min-h-0 bg-surface-950/60 shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
                {/* Header & 2-Button Filter Toggle */}
                <div className="p-3.5 border-b border-surface-800 space-y-3 bg-surface-900/70 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-accent-teal" />
                      <h3 className="font-bold text-sm text-white">Master Inbox</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {totalInboxUnread > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition cursor-pointer text-[11px] font-semibold flex items-center gap-1 shadow-sm"
                          title="Mark all conversations as read"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark Read</span>
                        </button>
                      )}
                      <button
                        onClick={fetchMasterInbox}
                        className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px]"
                        title="Refresh conversations"
                        aria-label="Refresh conversations"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Refresh</span>
                      </button>
                    </div>
                  </div>

                  {/* 2-Button Toggle: Chat List (Default) vs All Users */}
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-950 border border-surface-800 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setInboxFilter('chats')}
                      className={`py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        inboxFilter === 'chats'
                          ? 'bg-accent-teal text-surface-950 font-bold shadow-md'
                          : 'text-surface-400 hover:text-white hover:bg-surface-800/40'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat List</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        inboxFilter === 'chats' ? 'bg-surface-950/20 text-surface-950' : 'bg-surface-800 text-surface-300'
                      }`}>
                        {activeChatsCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInboxFilter('all')}
                      className={`py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        inboxFilter === 'all'
                          ? 'bg-accent-teal text-surface-950 font-bold shadow-md'
                          : 'text-surface-400 hover:text-white hover:bg-surface-800/40'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>All Users</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        inboxFilter === 'all' ? 'bg-surface-950/20 text-surface-950' : 'bg-surface-800 text-surface-300'
                      }`}>
                        {allConversationsCount}
                      </span>
                    </button>
                  </div>

                  {/* Quick Filter Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={inboxSearch}
                      onChange={(e) => setInboxSearch(e.target.value)}
                      placeholder="Search customer, profile, message..."
                      className="w-full bg-surface-950 border border-surface-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal transition"
                    />
                    {inboxSearch && (
                      <button
                        onClick={() => setInboxSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-surface-800/50">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-surface-400 space-y-3">
                      <div className="w-10 h-10 rounded-full bg-surface-800/60 text-surface-500 flex items-center justify-center mx-auto">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-surface-300">
                          {inboxFilter === 'chats' ? 'No active chat messages yet' : 'No conversations found'}
                        </p>
                        <p className="text-[11px] text-surface-500 mt-1 max-w-[220px] mx-auto">
                          {inboxFilter === 'chats'
                            ? 'When customers send messages, they will automatically appear in this Chat List.'
                            : 'No user matches or leads match your current search.'}
                        </p>
                      </div>
                      {inboxFilter === 'chats' && allConversationsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setInboxFilter('all')}
                          className="btn-secondary text-[11px] py-1 px-3 mt-1 inline-flex items-center gap-1.5"
                        >
                          <Users className="w-3 h-3" />
                          View All Leads ({allConversationsCount})
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredConversations.map((c) => {
                      const isSelected = selectedChat?.id === c.id;
                      const customerName = c.customer?.displayName || 'Customer';
                      const profileName = c.representedProfile?.displayName || 'Profile';
                      const unread = c.totalUnread || 0;
                      const hasUnread = unread > 0;

                      return (
                        <button
                          key={c.id}
                          onClick={() => handleSelectConversation(c)}
                          className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-surface-800/90'
                              : hasUnread
                                ? 'bg-surface-900/50 hover:bg-surface-800/60'
                                : 'hover:bg-surface-800/40'
                          }`}
                        >
                          {/* Customer Avatar */}
                          <div className="w-10 h-10 rounded-full ring-2 ring-surface-800 overflow-hidden bg-emerald-700/30 text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                            {c.customer?.photo || c.customer?.avatarUrl ? (
                              <img
                                src={c.customer.photo || c.customer.avatarUrl}
                                alt={customerName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              customerName.charAt(0).toUpperCase()
                            )}
                          </div>

                          <div className="flex-1 min-w-0 border-b border-surface-800/50 pb-3 -mb-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={`text-[13px] truncate flex items-center gap-1.5 ${
                                  hasUnread ? 'font-bold text-white' : 'font-semibold text-surface-100'
                                }`}
                              >
                                <span className="text-white truncate max-w-[85px]">{customerName}</span>
                                <span className="text-surface-500 font-normal text-xs shrink-0">to</span>
                                <span className="inline-flex items-center gap-1 min-w-0">
                                  <span className="w-4 h-4 rounded-full ring-1 ring-surface-700 overflow-hidden bg-brand-500/20 text-pink-300 font-semibold flex items-center justify-center text-[8px] shrink-0">
                                    {c.representedProfile?.photo || c.representedProfile?.avatarUrl ? (
                                      <img
                                        src={c.representedProfile.photo || c.representedProfile.avatarUrl}
                                        alt={profileName}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      profileName.charAt(0).toUpperCase()
                                    )}
                                  </span>
                                  <span className="text-accent-teal truncate max-w-[85px] font-medium">{profileName}</span>
                                </span>
                              </span>
                              <span
                                className={`text-[11px] shrink-0 tabular-nums ${
                                  hasUnread ? 'text-emerald-400 font-semibold' : 'text-surface-500'
                                }`}
                              >
                                {chatListTime(c.lastMessageAt || c.updatedAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-mono text-surface-400 shrink-0">
                                ID: #{c.customer?.userId ? c.customer.userId.slice(-6) : 'guest'}
                              </span>
                              <span className="text-surface-600 text-[10px]">·</span>
                              <p
                                className={`text-[12px] truncate ${
                                  hasUnread ? 'text-surface-200 font-medium' : 'text-surface-500'
                                }`}
                              >
                                {c.lastMessagePreview || 'New conversation'}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Chat View & Staff Assisted Reply */}
              <div className={`flex-1 flex flex-col h-full min-h-0 bg-surface-950/40 overflow-hidden ${selectedChat ? 'flex' : 'hidden md:flex'}`}>
                {selectedChat ? (
                  <>
                    {/* Active Chat Header with Mobile Back Button */}
                    <div className="p-3 sm:p-3.5 border-b border-surface-800 bg-surface-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={handleCloseSelectedChat}
                          className="md:hidden p-2 -ml-1 text-surface-400 hover:text-white rounded-xl hover:bg-surface-800 transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                          title="Back to conversation list"
                          aria-label="Back to conversation list"
                        >
                          <ChevronLeft className="w-5 h-5 text-white" />
                        </button>

                        {/* Customer Avatar & Profile Avatar side by side with arrow */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Customer Avatar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-10 h-10 rounded-full ring-2 ring-emerald-500/60 overflow-hidden bg-emerald-800/40 text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0 shadow-md">
                              {selectedChat.customer?.photo || selectedChat.customer?.avatarUrl ? (
                                <img
                                  src={selectedChat.customer.photo || selectedChat.customer.avatarUrl}
                                  alt={selectedChat.customer.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (selectedChat.customer?.displayName || 'C').charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="hidden sm:block">
                              <p className="text-xs font-bold text-white truncate max-w-[100px]">
                                {selectedChat.customer?.displayName || 'Customer'}
                              </p>
                              <p className="text-[10px] text-surface-400 font-mono">
                                ID: #{selectedChat.customer?.userId ? selectedChat.customer.userId.slice(-6) : 'guest'}
                              </p>
                            </div>
                          </div>

                          <span className="text-surface-400 text-xs font-bold px-1">➔</span>

                          {/* Profile Avatar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-10 h-10 rounded-full ring-2 ring-brand-500/60 overflow-hidden bg-brand-500/30 text-pink-300 font-bold flex items-center justify-center text-xs shrink-0 shadow-md">
                              {selectedChat.representedProfile?.photo || selectedChat.representedProfile?.avatarUrl ? (
                                <img
                                  src={selectedChat.representedProfile.photo || selectedChat.representedProfile.avatarUrl}
                                  alt={selectedChat.representedProfile.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (selectedChat.representedProfile?.displayName || 'P').charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-accent-teal truncate max-w-[100px]">
                                {selectedChat.representedProfile?.displayName || 'Profile'}
                              </p>
                              <p className="text-[10px] text-emerald-400 font-medium">
                                Replying as {selectedChat.representedProfile?.displayName || 'Profile'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {selectedChat.isAssisted && (
                          <span className="badge-teal text-[10px] px-2 py-0.5 hidden sm:inline-flex">
                            Direct Reply
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Messages Stream */}
                    <div className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-4 py-3 bg-[radial-gradient(ellipse_at_top,_rgba(40,40,55,0.4),_transparent_55%)]">
                      {chatMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-surface-400 text-xs">
                          <MessageSquare className="w-8 h-8 text-surface-600 mb-2 opacity-60" />
                          <p className="font-semibold text-surface-300">No messages yet</p>
                          <p className="text-[11px] text-surface-500 mt-1 max-w-[240px]">
                            Reply as {selectedChat.representedProfile?.displayName || 'the profile'} to start.
                          </p>
                        </div>
                      ) : (
                        chatMessages.map((msg, idx) => {
                          const isStaff = !!msg.senderStaffId || !!msg.senderStaff || msg.status === 'sending';
                          const prev = idx > 0 ? chatMessages[idx - 1] : null;
                          const showDay = !prev || !sameCalendarDay(prev.createdAt, msg.createdAt);
                          const pending = msg.status === 'sending' || String(msg.id).startsWith('temp-');

                          return (
                            <div key={msg.id}>
                              {showDay && <DayChip label={dayLabel(msg.createdAt)} />}
                              <div className={`flex ${isStaff ? 'justify-end' : 'justify-start'} mb-0.5`}>
                                <div
                                  className={`max-w-[85%] sm:max-w-[72%] px-2.5 pt-1.5 pb-1 text-[13px] leading-snug shadow-sm ${
                                    isStaff
                                      ? 'bg-emerald-700/90 text-white rounded-2xl rounded-br-sm'
                                      : 'bg-surface-800 text-surface-50 rounded-2xl rounded-bl-sm border border-surface-700/40'
                                  } ${pending ? 'opacity-70' : ''}`}
                                >
                                  {isStaff && (
                                    <p className="text-[10px] font-semibold text-emerald-200/90 mb-0.5">
                                      {selectedChat.representedProfile?.displayName || 'Profile'}
                                    </p>
                                  )}
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
                                          onClick={() => window.open(msg.mediaUrl, '_blank')}
                                        />
                                      )}
                                    </div>
                                  )}
                                  {msg.content && msg.content !== '📷 Photo' && msg.content !== '📹 Video' && (
                                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                  )}
                                  <div
                                    className={`flex items-center justify-end gap-1 mt-0.5 ${
                                      isStaff ? 'text-white/55' : 'text-surface-500'
                                    }`}
                                  >
                                    <span className="text-[10px] tabular-nums">
                                      {chatBubbleTime(msg.createdAt)}
                                    </span>
                                    {isStaff && (
                                      <MessageTicks status={pending ? 'sent' : 'read'} pending={pending} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatMessagesEndRef} />
                    </div>

                    {/* Staff Reply Form */}
                    <form
                      onSubmit={(e) => handleSendStaffReply(e)}
                      className="p-2.5 sm:p-3 border-t border-surface-800 bg-surface-900/95 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0"
                    >
                      <p className="text-[11px] text-surface-500 px-1">
                        Replying as{' '}
                        <span className="text-emerald-400 font-semibold">
                          {selectedChat.representedProfile?.displayName || 'Maya'}
                        </span>
                      </p>
                      <div className="flex items-end gap-1.5 sm:gap-2">
                        {/* Hidden File Input for Staff Photos and Videos */}
                        <input
                          type="file"
                          ref={adminMediaInputRef}
                          accept="image/*,video/*"
                          onChange={handleAdminMediaUpload}
                          className="hidden"
                        />

                        {/* Photo/Video Attachment Button */}
                        <button
                          type="button"
                          onClick={() => adminMediaInputRef.current?.click()}
                          disabled={uploadingAdminMedia || sendingStaffReply}
                          className="w-10 h-10 rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-50 border border-surface-700/60"
                          title="Attach photo or video"
                          aria-label="Attach photo or video"
                        >
                          {uploadingAdminMedia ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
                          ) : (
                            <Camera className="w-5 h-5 text-surface-300" />
                          )}
                        </button>

                        <div className="flex-1 min-h-[44px] bg-surface-800 border border-surface-700/70 focus-within:border-surface-500 rounded-[22px] px-4 py-1.5 flex items-center">
                          <textarea
                            ref={adminTextareaRef}
                            rows={1}
                            value={staffReplyInput}
                            onChange={(e) => {
                              setStaffReplyInput(e.target.value);
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
                                // PC normal Enter: send reply immediately
                                e.preventDefault();
                                handleSendStaffReply(e);
                              }
                            }}
                            placeholder="Message"
                            disabled={sendingStaffReply || uploadingAdminMedia}
                            className="w-full bg-transparent text-[15px] text-white placeholder-surface-500 focus:outline-none resize-none max-h-28 overflow-y-auto leading-relaxed py-1"
                            autoComplete="off"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={(!staffReplyInput.trim() && !uploadingAdminMedia) || sendingStaffReply}
                          className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed shadow-md"
                          title="Send reply"
                          aria-label="Send reply"
                        >
                          {sendingStaffReply ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-surface-400 text-xs">
                    <div className="w-14 h-14 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center mb-3">
                      <MessageSquare className="w-7 h-7 text-accent-teal" />
                    </div>
                    <p className="font-semibold text-white text-sm">Select a Conversation</p>
                    <p className="text-xs text-surface-400 mt-1 max-w-xs">
                      Choose a customer from the {inboxFilter === 'chats' ? 'Chat List' : 'All Users list'} to view conversation history and reply on behalf of profiles.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'trips' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Travel profiles</h2>
                <p className="text-xs text-surface-400">
                  Create Europe / America home profiles traveling soon to Dubai (or other Gulf cities).
                  Meta ads target Indian &amp; Pakistani expats in Ads Manager — not as profile home countries.
                </p>
              </div>

              <form
                onSubmit={handleCreateProfile}
                className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
              >
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-1">
                    New curated profile
                  </p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="input-label">Display name</label>
                    <input
                      value={profileForm.displayName}
                      onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                      className="input-field py-2 text-xs"
                      placeholder="Emma"
                      required
                    />
                  </div>
                  <div>
                    <label className="input-label">Age</label>
                    <input
                      type="number"
                      min={18}
                      max={85}
                      value={profileForm.age}
                      onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
                      className="input-field py-2 text-xs"
                      placeholder="24"
                      required
                    />
                  </div>
                  <div>
                    <label className="input-label">Gender</label>
                    <select
                      value={profileForm.gender}
                      onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                      className="input-field py-2 text-xs"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="input-label">Home country (EU / US)</label>
                  <input
                    value={profileForm.country}
                    onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder="United Kingdom"
                  />
                </div>
                <div>
                  <label className="input-label">Home city</label>
                  <input
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder="London"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="input-label">Bio</label>
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    className="input-field py-2 text-xs min-h-[70px]"
                    placeholder="Traveling soon to Dubai…"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="input-label mb-0">Profile photo</label>
                    <span className="text-[11px] text-surface-400">Upload photo file or paste direct image URL</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-11 h-11 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center shrink-0 overflow-hidden shadow-inner group">
                      {profileForm.photoUrl ? (
                        <>
                          <img
                            src={profileForm.photoUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setProfileForm({ ...profileForm, photoUrl: '' })}
                            className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition-opacity"
                            title="Remove photo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <Camera className="w-5 h-5 text-surface-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        value={profileForm.photoUrl}
                        onChange={(e) => setProfileForm({ ...profileForm, photoUrl: e.target.value })}
                        className="input-field py-2 text-xs w-full"
                        placeholder="Paste image URL (https://...) or click Upload ->"
                      />
                    </div>
                    <div>
                      <input
                        ref={profilePhotoFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadProfilePhotoFile}
                      />
                      <button
                        type="button"
                        onClick={() => profilePhotoFileRef.current?.click()}
                        disabled={uploadingProfilePhoto}
                        className="btn-ghost py-2 px-3 text-xs border border-surface-700 hover:border-brand-teal/60 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {uploadingProfilePhoto ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                            <span>Uploading…</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-brand-teal" />
                            <span>Upload photo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="input-label">Interests</label>
                  <input
                    value={profileForm.interests}
                    onChange={(e) => setProfileForm({ ...profileForm, interests: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder="Travel, Cafes, Photography"
                  />
                </div>
                <div>
                  <label className="input-label">Traveling soon to</label>
                  <select
                    value={profileForm.travelCity}
                    onChange={(e) => {
                      const travelCity = e.target.value;
                      setProfileForm({
                        ...profileForm,
                        travelCity,
                        travelNote: `Traveling soon to ${travelCity}.`,
                      });
                    }}
                    className="input-field py-2 text-xs"
                  >
                    <option>Dubai</option>
                    <option>Abu Dhabi</option>
                    <option>Sharjah</option>
                    <option>Riyadh</option>
                    <option>Jeddah</option>
                    <option>Dammam</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Travel note</label>
                  <input
                    value={profileForm.travelNote}
                    onChange={(e) => setProfileForm({ ...profileForm, travelNote: e.target.value })}
                    className="input-field py-2 text-xs"
                    placeholder="Traveling soon to Dubai."
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="btn-primary py-2 px-4 text-xs font-semibold disabled:opacity-50"
                  >
                    {savingProfile ? 'Creating…' : 'Create profile'}
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleCreateTrip}
                className="glass-card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs"
              >
                <div className="sm:col-span-2 flex items-center justify-between border-b border-surface-800 pb-2.5">
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>Add Trip to Existing Profile</span>
                      <Plane className="w-4 h-4 text-accent-teal" />
                    </p>
                    <p className="text-[11px] text-surface-400">
                      Share multiple destinations per profile with customized trip photos and flexible dates
                    </p>
                  </div>
                </div>

                {/* 1. Profile selector */}
                <div className="sm:col-span-2">
                  <label className="input-label">Select Curated Profile *</label>
                  <select
                    value={tripForm.profileId}
                    onChange={(e) => setTripForm({ ...tripForm, profileId: e.target.value })}
                    className="input-field py-2 text-xs"
                    required
                  >
                    <option value="">Select a curated profile</option>
                    {curatedProfiles.map((u) => (
                      <option key={u.id} value={u.profileId}>
                        {u.displayName} ({u.country || 'Europe/US'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Destination Country */}
                <div>
                  <label className="input-label flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-accent-teal" />
                    <span>Destination Country *</span>
                  </label>
                  <select
                    value={tripForm.country}
                    onChange={(e) => handleCountryChangeForTrip(e.target.value)}
                    className="input-field py-2 text-xs"
                    required
                  >
                    {POPULAR_COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Other">Other Country...</option>
                  </select>
                  {tripForm.country === 'Other' && (
                    <input
                      type="text"
                      value={tripForm.customCountry}
                      onChange={(e) => setTripForm({ ...tripForm, customCountry: e.target.value })}
                      placeholder="Enter destination country"
                      className="input-field py-2 text-xs mt-1.5"
                      required
                    />
                  )}
                </div>

                {/* 3. Destination City */}
                <div>
                  <label className="input-label flex items-center gap-1">
                    <Plane className="w-3.5 h-3.5 text-accent-teal" />
                    <span>Destination City *</span>
                  </label>
                  {tripForm.country !== 'Other' && COUNTRY_CITIES[tripForm.country]?.length > 0 ? (
                    <>
                      <select
                        value={tripForm.city}
                        onChange={(e) => handleCityChangeForTrip(e.target.value)}
                        className="input-field py-2 text-xs"
                        required
                      >
                        {COUNTRY_CITIES[tripForm.country].map((cityName) => (
                          <option key={cityName} value={cityName}>
                            {cityName}
                          </option>
                        ))}
                        <option value="Other">Other City...</option>
                      </select>
                      {tripForm.city === 'Other' && (
                        <input
                          type="text"
                          value={tripForm.customCity}
                          onChange={(e) => setTripForm({ ...tripForm, customCity: e.target.value })}
                          placeholder="Enter destination city"
                          className="input-field py-2 text-xs mt-1.5"
                          required
                        />
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={tripForm.customCity}
                      onChange={(e) => setTripForm({ ...tripForm, customCity: e.target.value })}
                      placeholder="Enter destination city"
                      className="input-field py-2 text-xs"
                      required
                    />
                  )}
                </div>

                {/* 4. Flexible Timing Options (Same as user side) */}
                <div className="sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="input-label mb-0 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-accent-teal" />
                      <span>When is the trip? (Flexible Timeline)</span>
                    </label>
                    <span className="text-[11px] text-surface-400">Match visitors during this timeline</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TIMING_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => setTripForm({ ...tripForm, timing: opt.id })}
                        className={`p-2.5 rounded-xl text-left border transition text-xs flex flex-col justify-between cursor-pointer ${
                          tripForm.timing === opt.id
                            ? 'bg-accent-teal/20 border-accent-teal text-white shadow-sm ring-1 ring-accent-teal/40'
                            : 'bg-surface-900 border-surface-800 text-surface-400 hover:text-surface-200 hover:border-surface-700'
                        }`}
                      >
                        <span className="font-bold text-[11px] text-white block mb-0.5">{opt.label}</span>
                        <span className="text-[10px] text-surface-400 leading-tight">{opt.desc}</span>
                      </button>
                    ))}
                  </div>

                  {tripForm.timing === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 p-3 rounded-xl bg-surface-900/60 border border-surface-800 animate-fadeIn">
                      <div>
                        <label className="input-label">Arrives (Start Date)</label>
                        <input
                          type="date"
                          value={tripForm.fromDate}
                          onChange={(e) => setTripForm({ ...tripForm, fromDate: e.target.value })}
                          className="input-field py-2 text-xs"
                          required={tripForm.timing === 'custom'}
                        />
                      </div>
                      <div>
                        <label className="input-label">Leaves (End Date)</label>
                        <input
                          type="date"
                          value={tripForm.toDate}
                          onChange={(e) => setTripForm({ ...tripForm, toDate: e.target.value })}
                          className="input-field py-2 text-xs"
                          required={tripForm.timing === 'custom'}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Trip Specific Cover Photo (Upload or Paste URL) */}
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="input-label mb-0 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-accent-teal" />
                      <span>Trip Cover Photo (Unique photo for this destination)</span>
                    </label>
                    <span className="text-[11px] text-surface-400">Upload photo file or paste image URL</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center shrink-0 overflow-hidden shadow-inner group">
                      {tripForm.photoUrl ? (
                        <>
                          <img
                            src={tripForm.photoUrl}
                            alt="Trip cover"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setTripForm({ ...tripForm, photoUrl: '' })}
                            className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition-opacity"
                            title="Remove photo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <Plane className="w-5 h-5 text-surface-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        value={tripForm.photoUrl}
                        onChange={(e) => setTripForm({ ...tripForm, photoUrl: e.target.value })}
                        className="input-field py-2 text-xs w-full"
                        placeholder="Paste image URL (https://...) or click Upload photo ->"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={tripPhotoFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadTripPhotoFile}
                      />
                      <button
                        type="button"
                        onClick={() => tripPhotoFileRef.current?.click()}
                        disabled={uploadingTripPhoto}
                        className="btn-ghost py-2 px-3 text-xs border border-surface-700 hover:border-brand-teal/60 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {uploadingTripPhoto ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                            <span>Uploading…</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-brand-teal" />
                            <span>Upload photo</span>
                          </>
                        )}
                      </button>
                      {DESTINATION_PHOTOS[tripForm.city] && tripForm.photoUrl !== DESTINATION_PHOTOS[tripForm.city] && (
                        <button
                          type="button"
                          onClick={() => setTripForm({ ...tripForm, photoUrl: DESTINATION_PHOTOS[tripForm.city] })}
                          className="btn-ghost py-2 px-2.5 text-[11px] text-surface-400 hover:text-white border border-surface-700 whitespace-nowrap"
                          title="Use landmark photo for destination"
                        >
                          Landmark
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. Note on the card */}
                <div className="sm:col-span-2">
                  <label className="input-label">Note on the card</label>
                  <input
                    value={tripForm.note}
                    onChange={(e) => setTripForm({ ...tripForm, note: e.target.value })}
                    placeholder="Traveling soon · looking for local company"
                    className="input-field py-2 text-xs"
                  />
                </div>

                {/* Submit button */}
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingTrip || uploadingTripPhoto}
                    className="btn-primary py-2.5 px-5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingTrip ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Adding trip…</span>
                      </>
                    ) : (
                      <>
                        <Plane className="w-3.5 h-3.5" />
                        <span>Share & Add trip ✈</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between pt-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Active Travel Plans & Destinations</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-800 text-surface-300 font-normal">
                      {travelPlans.length}
                    </span>
                  </h3>
                </div>

                {travelPlans.length === 0 && (
                  <p className="text-xs text-surface-400">No trips yet. Create a trip above to start matching visitors.</p>
                )}
                {travelPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-900/70 border border-surface-800 hover:border-surface-700 transition"
                  >
                    {plan.photo ? (
                      <img src={plan.photo} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-surface-700 shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center shrink-0 text-surface-500">
                        <Plane className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {plan.profileName} → {plan.city}{plan.country ? `, ${plan.country}` : ''}
                        </p>
                        {plan.timing ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-teal/15 text-accent-teal border border-accent-teal/30 capitalize font-medium">
                            {plan.timing.replace('_', ' ')}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-surface-400 mt-0.5">
                        {new Date(plan.fromDate).toLocaleDateString()} – {new Date(plan.toDate).toLocaleDateString()}
                        {plan.note ? ` · "${plan.note}"` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(plan.id)}
                      disabled={deletingTripId === plan.id}
                      className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer shrink-0"
                      title="Delete trip plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 5. CAMPAIGNS & UTM ROUTING                                   */}
          {/* ============================================================ */}
          {activeTab === 'campaigns' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Ad Campaigns & Traffic Attribution</h2>
                  <p className="text-xs text-surface-400">
                    Connect paid ads to track traffic channels, incoming leads, and ad conversion URLs.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewCampaignModal(true)}
                  className="btn-primary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Campaign</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaigns.map((camp) => {
                  return (
                    <div key={camp.id} className="glass-card p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-white text-sm">{camp.name}</h3>
                          <span className="badge-brand text-[10px] capitalize mt-1 inline-block">
                            {camp.platform}
                          </span>
                        </div>
                        <span className="badge-teal text-[10px] uppercase font-bold">
                          {camp.status}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-surface-900/80 border border-surface-800 text-[11px] font-mono text-surface-300 break-all">
                        utm_campaign={camp.utmCampaign}
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-800">
                        <div>
                          <span className="text-[10px] text-surface-400 block">Total Inbound Leads:</span>
                          <span className="font-semibold text-accent-teal">
                            {camp.leadsCount || 0} Registered
                          </span>
                        </div>

                        <button
                          onClick={() => handleCopyLink(camp.utmCampaign)}
                          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                        >
                          {copiedLink === camp.utmCampaign ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-accent-teal" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Ad Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 6. MODERATION & REPORTS                                      */}
          {/* ============================================================ */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Reports & Community Moderation</h2>
                <p className="text-xs text-surface-400">
                  Review flagged user profiles, offensive messages, and protect platform safety.
                </p>
              </div>

              <div className="glass-card p-6 text-center text-xs text-surface-400">
                <CheckCircle2 className="w-10 h-10 text-accent-teal mx-auto mb-2" />
                <p className="font-bold text-white mb-1">Queue Clean</p>
                <p>No unresolved safety reports at this time.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CREATE CAMPAIGN */}
      {showNewCampaignModal && (
        <div className="modal-overlay" onClick={() => setShowNewCampaignModal(false)}>
          <div className="modal-content max-w-md relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Create Ad Campaign</h3>
              <button
                type="button"
                onClick={() => setShowNewCampaignModal(false)}
                className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Close campaign dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
              <div>
                <label className="input-label">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g. UK Spring Matchmaking Ad"
                  className="input-field text-xs py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="input-label">Ad Platform</label>
                  <select
                    value={newCampPlatform}
                    onChange={(e) => setNewCampPlatform(e.target.value)}
                    className="input-field text-xs py-2"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">utm_campaign key</label>
                  <input
                    type="text"
                    required
                    value={newCampUtmCampaign}
                    onChange={(e) => setNewCampUtmCampaign(e.target.value)}
                    placeholder="e.g. uk_spring_2026"
                    className="input-field text-xs py-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCampaignModal(false)}
                  className="btn-ghost py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5 px-4 text-xs font-semibold">
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
