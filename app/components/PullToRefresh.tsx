'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  onRefresh?: () => Promise<void> | void;
  className?: string;
  children: React.ReactNode;
}

const THRESHOLD = 64; // px to trigger refresh
const MAX_PULL = 90; // max visual pull

export default function PullToRefresh({ onRefresh, className, children }: Props) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only trigger if at top of page/viewport
    if (window.scrollY <= 0 && !isRefreshing) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pullingRef.current || isRefreshing) return;
    if (window.scrollY > 0) {
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Elastic damping physics
      const distance = Math.min(MAX_PULL, diff * 0.45);
      setPullDistance(distance);
      if (distance > 10 && e.cancelable) {
        // Prevent default overscroll bounce
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD * 0.75);

      try {
        if (onRefresh) {
          await onRefresh();
        } else {
          // Default soft page refresh
          window.location.reload();
        }
      } catch {
        // Ignore refresh errors
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 500);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(1, pullDistance / THRESHOLD);
  const rotation = isRefreshing ? 'animate-spin' : '';

  return (
    <div className={`relative w-full ${className || ''}`}>
      {/* Pull Indicator Pill */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-2 inset-x-0 z-50 flex justify-center pointer-events-none transition-transform duration-100 ease-out"
          style={{
            transform: `translateY(${pullDistance}px)`,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-900/95 border border-surface-700/80 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <RefreshCw
              className={`w-4 h-4 text-brand-400 ${rotation}`}
              style={{
                transform: isRefreshing ? undefined : `rotate(${progress * 270}deg)`,
              }}
            />
            <span className="text-[11px] font-bold text-surface-200">
              {isRefreshing
                ? 'Refreshing…'
                : pullDistance >= THRESHOLD
                ? 'Release to refresh'
                : 'Pull down to refresh'}
            </span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
