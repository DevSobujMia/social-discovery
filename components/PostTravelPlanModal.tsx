'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Plane,
  MapPin,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  Clock,
  Upload
} from 'lucide-react';
import { ImageCropperModal } from './ImageCropperModal';

interface PostTravelPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any | null;
  onPlanCreated: (newPlan: any) => void;
  onRequestAuth?: () => void;
}

export const COUNTRY_CITIES: Record<string, string[]> = {
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ras Al Khaimah'],
  'Thailand': ['Bangkok', 'Phuket', 'Chiang Mai', 'Pattaya', 'Koh Samui'],
  'France': ['Paris', 'Nice', 'Lyon', 'Marseille', 'Cannes'],
  'Italy': ['Rome', 'Milan', 'Florence', 'Venice', 'Naples'],
  'Japan': ['Tokyo', 'Kyoto', 'Osaka', 'Sapporo', 'Fukuoka'],
  'United Kingdom': ['London', 'Manchester', 'Edinburgh', 'Birmingham', 'Liverpool'],
  'United States': ['New York', 'Los Angeles', 'Miami', 'Las Vegas', 'San Francisco', 'Chicago'],
  'Spain': ['Barcelona', 'Madrid', 'Ibiza', 'Valencia', 'Seville'],
  'Turkey': ['Istanbul', 'Antalya', 'Cappadocia', 'Bodrum', 'Izmir'],
  'Indonesia': ['Bali', 'Jakarta', 'Lombok', 'Yogyakarta'],
  'Singapore': ['Singapore'],
  'Malaysia': ['Kuala Lumpur', 'Penang', 'Langkawi'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Mecca', 'Medina'],
  'Germany': ['Berlin', 'Munich', 'Frankfurt', 'Hamburg'],
  'Switzerland': ['Zurich', 'Geneva', 'Lucerne', 'Interlaken'],
};

export const POPULAR_COUNTRIES = Object.keys(COUNTRY_CITIES);

export const DESTINATION_PHOTOS: Record<string, string> = {
  'Dubai': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1000&auto=format&fit=crop&q=80',
  'Paris': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1000&auto=format&fit=crop&q=80',
  'Bangkok': 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1000&auto=format&fit=crop&q=80',
  'Tokyo': 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1000&auto=format&fit=crop&q=80',
  'Rome': 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1000&auto=format&fit=crop&q=80',
  'London': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1000&auto=format&fit=crop&q=80',
  'Bali': 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1000&auto=format&fit=crop&q=80',
  'New York': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1000&auto=format&fit=crop&q=80',
  'Barcelona': 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1000&auto=format&fit=crop&q=80',
  'Istanbul': 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1000&auto=format&fit=crop&q=80',
  'Singapore': 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1000&auto=format&fit=crop&q=80',
};

export const TIMING_OPTIONS = [
  { id: 'coming_soon', label: 'Coming soon', desc: 'Next 1–2 weeks' },
  { id: 'next_month', label: 'Coming next month', desc: 'Starting next month' },
  { id: 'flexible', label: 'Flexible dates', desc: 'Anytime this season' },
  { id: 'custom', label: 'Custom dates', desc: 'Pick specific dates' },
];

export function PostTravelPlanModal({
  isOpen,
  onClose,
  currentUser,
  onPlanCreated,
  onRequestAuth,
}: PostTravelPlanModalProps) {
  const [country, setCountry] = useState('United Arab Emirates');
  const [city, setCity] = useState('Dubai');
  const [customCountry, setCustomCountry] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [timing, setTiming] = useState('coming_soon');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>(DESTINATION_PHOTOS['Dubai']);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [tripCropFile, setTripCropFile] = useState<File | null>(null);
  const [showTripCropper, setShowTripCropper] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const effectiveCountry = country === 'Other' ? customCountry.trim() : country;
  const effectiveCity = city === 'Other' ? customCity.trim() : city;

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    if (newCountry !== 'Other' && COUNTRY_CITIES[newCountry]?.length > 0) {
      const firstCity = COUNTRY_CITIES[newCountry][0];
      setCity(firstCity);
      if (DESTINATION_PHOTOS[firstCity]) {
        setPhotoUrl(DESTINATION_PHOTOS[firstCity]);
      }
    } else {
      setCity('Other');
    }
  };

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    if (DESTINATION_PHOTOS[newCity]) {
      setPhotoUrl(DESTINATION_PHOTOS[newCity]);
    }
  };

  const handlePhotoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTripCropFile(file);
    setShowTripCropper(true);
    e.target.value = '';
  };

  const handleTripPhotoCropped = async (croppedFile: File) => {
    setShowTripCropper(false);
    setTripCropFile(null);
    await uploadTripPhotoFile(croppedFile);
  };

  const uploadTripPhotoFile = async (file: File) => {
    setUploadingPhoto(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setPhotoUrl(data.data.url);
      } else {
        setErrorMsg(data.error?.message || 'Could not upload photo');
      }
    } catch {
      setErrorMsg('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!effectiveCountry || !effectiveCity) {
      setErrorMsg('Please specify both country and city');
      return;
    }

    if (timing === 'custom') {
      if (!fromDate || !toDate) {
        setErrorMsg('Please select both start and end dates for custom date range');
        return;
      }
      if (new Date(fromDate) > new Date(toDate)) {
        setErrorMsg('End date must be after start date');
        return;
      }
    }

    if (!currentUser) {
      if (onRequestAuth) onRequestAuth();
      else setErrorMsg('Please sign in first to post your travel plan');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/travel-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: effectiveCountry,
          city: effectiveCity,
          timing,
          fromDate: timing === 'custom' ? fromDate : undefined,
          toDate: timing === 'custom' ? toDate : undefined,
          note: note.trim() || undefined,
          photoUrl: photoUrl?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success && data.data?.travelPlan) {
        onPlanCreated(data.data.travelPlan);
        onClose();
      } else {
        setErrorMsg(data.error?.message || 'Failed to publish travel plan');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface-900 border border-surface-700/70 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header with Plane Icon and Gradient Glow */}
        <div className="p-4 sm:p-5 border-b border-surface-800 bg-gradient-to-r from-accent-teal/15 via-surface-900 to-brand-500/10 shrink-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center text-accent-teal shadow-md">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5">
                <span>Share Your Travel Plan</span>
                <Sparkles className="w-4 h-4 text-accent-teal" />
              </h2>
              <p className="text-xs text-surface-400">
                Connect with partners visiting the same city
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white p-1 rounded-lg hover:bg-surface-800/80 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* 1. Destination: Country First, then City (Cascading) */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Destination Country First */}
              <div>
                <label className="block font-semibold text-surface-200 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-accent-teal" />
                  <span>Destination Country <span className="text-brand-400">*</span></span>
                </label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-accent-teal text-xs transition cursor-pointer"
                  required
                >
                  {POPULAR_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="Other">Other Country...</option>
                </select>
                {country === 'Other' && (
                  <input
                    type="text"
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    placeholder="Enter country name"
                    className="w-full mt-2 bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2 text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal text-xs"
                    required
                  />
                )}
              </div>

              {/* City (Auto-populated based on Country) */}
              <div>
                <label className="block font-semibold text-surface-200 mb-1 flex items-center gap-1.5">
                  <Plane className="w-3.5 h-3.5 text-accent-teal" />
                  <span>Destination City <span className="text-brand-400">*</span></span>
                </label>
                {country !== 'Other' && COUNTRY_CITIES[country]?.length > 0 ? (
                  <>
                    <select
                      value={city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-accent-teal text-xs transition cursor-pointer"
                      required
                    >
                      {COUNTRY_CITIES[country].map((cityName) => (
                        <option key={cityName} value={cityName}>
                          {cityName}
                        </option>
                      ))}
                      <option value="Other">Other city...</option>
                    </select>
                    {city === 'Other' && (
                      <input
                        type="text"
                        value={customCity}
                        onChange={(e) => setCustomCity(e.target.value)}
                        placeholder="Enter city name"
                        className="w-full mt-2 bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2 text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal text-xs"
                        required
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Enter city name"
                    className="w-full bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2 text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal text-xs"
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* 2. Flexible Timing (No strict fixed dates) */}
          <div>
            <label className="block font-semibold text-surface-200 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-accent-teal" />
                <span>When are you traveling?</span>
              </span>
              <span className="text-[10px] text-surface-400 font-normal">Flexible timeline</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TIMING_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setTiming(opt.id)}
                  className={`p-2.5 rounded-xl text-left border transition text-xs flex flex-col justify-between cursor-pointer ${
                    timing === opt.id
                      ? 'bg-accent-teal/20 border-accent-teal text-white shadow-sm ring-1 ring-accent-teal/40'
                      : 'bg-surface-950/80 border-surface-800 text-surface-400 hover:text-surface-200 hover:border-surface-700'
                  }`}
                >
                  <span className="font-bold text-[11px] text-white block mb-0.5">{opt.label}</span>
                  <span className="text-[10px] text-surface-400 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>

            {/* If Custom Dates selected, reveal date pickers */}
            {timing === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-2.5 p-3 rounded-xl bg-surface-950/60 border border-surface-800 animate-fadeIn">
                <div>
                  <label className="block text-[10px] text-surface-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-accent-teal"
                    required={timing === 'custom'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-surface-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-accent-teal"
                    required={timing === 'custom'}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Trip Plan Photo (Upload custom or use landmark photo) */}
          <div>
            <label className="block font-semibold text-surface-200 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-accent-teal" />
                <span>Trip Cover Photo</span>
              </span>
              <span className="text-[10px] text-surface-400 font-normal">Shown on your discovery card</span>
            </label>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-950/70 border border-surface-800">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-surface-800 shrink-0 border border-surface-700/60 shadow-md">
                {photoUrl ? (
                  <img src={photoUrl} alt="Trip cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-surface-500">
                    <Plane className="w-6 h-6" />
                  </div>
                )}
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 animate-spin text-accent-teal" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-white font-semibold text-xs border border-surface-600/70 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-accent-teal" />
                    <span>Upload Photo</span>
                  </button>
                  {DESTINATION_PHOTOS[effectiveCity] && photoUrl !== DESTINATION_PHOTOS[effectiveCity] && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(DESTINATION_PHOTOS[effectiveCity])}
                      className="px-2.5 py-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 text-[11px] transition cursor-pointer"
                    >
                      Use landmark photo
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-surface-400">
                  Upload a travel photo or view from your trip destination.
                </p>
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/*"
                  onChange={handlePhotoFileSelected}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* 4. Travel Note & Purpose */}
          <div>
            <label className="block font-semibold text-surface-200 mb-1">
              Travel Note / What kind of companion are you looking for?
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe your trip plans and what kind of local companion or guide you are looking for..."
              className="w-full bg-surface-950 border border-surface-700/80 rounded-xl px-3 py-2 text-white placeholder-surface-500 focus:outline-none focus:border-accent-teal text-xs leading-relaxed transition resize-none"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-2.5 shrink-0 border-t border-surface-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-surface-400 hover:text-white font-medium hover:bg-surface-800 transition text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingPhoto}
              className="btn-primary px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/20 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Plane className="w-3.5 h-3.5" />
                  <span>Publish Travel Plan ✈</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <ImageCropperModal
        isOpen={showTripCropper}
        file={tripCropFile}
        aspectRatio={4 / 3}
        allowedAspectRatios={[
          { label: '4:3 Standard', ratio: 4 / 3 },
          { label: '1:1 Square', ratio: 1 },
          { label: '16:9 Wide', ratio: 16 / 9 },
        ]}
        cropShape="rect"
        title="Position Trip Photo"
        onCrop={handleTripPhotoCropped}
        onCancel={() => {
          setShowTripCropper(false);
          setTripCropFile(null);
        }}
      />
    </div>
  );
}
