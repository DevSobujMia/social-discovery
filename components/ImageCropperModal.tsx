'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Check, X, Move } from 'lucide-react';

export interface ImageCropperModalProps {
  file: File | null;
  isOpen: boolean;
  aspectRatio?: number; // width / height, e.g. 1 for square (avatar), 4/3 or 16/9 for trip
  allowedAspectRatios?: { label: string; ratio: number }[];
  cropShape?: 'round' | 'rect';
  title?: string;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}

export function ImageCropperModal({
  file,
  isOpen,
  aspectRatio: initialAspectRatio = 1,
  allowedAspectRatios,
  cropShape = 'rect',
  title = 'Adjust & Position Photo',
  onCrop,
  onCancel,
}: ImageCropperModalProps) {
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const touchPinchRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  // Sync aspect ratio prop
  useEffect(() => {
    setAspectRatio(initialAspectRatio);
  }, [initialAspectRatio]);

  // Load object URL when file changes
  useEffect(() => {
    if (!file || !isOpen) {
      setImageSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isOpen]);

  // Calculate crop window frame dimensions (responsive, fits comfortably in viewport)
  // Max frame size: 340px width or height
  const frameMaxDim = 320;
  let frameWidth = frameMaxDim;
  let frameHeight = frameMaxDim;

  if (aspectRatio >= 1) {
    frameWidth = frameMaxDim;
    frameHeight = Math.round(frameMaxDim / aspectRatio);
  } else {
    frameHeight = frameMaxDim;
    frameWidth = Math.round(frameMaxDim * aspectRatio);
  }

  // Calculate base cover scale and max pan offsets
  const getCoverMetrics = useCallback(() => {
    if (!naturalSize.width || !naturalSize.height) {
      return { baseScale: 1, maxOffsetX: 0, maxOffsetY: 0, displayWidth: frameWidth, displayHeight: frameHeight };
    }
    const scaleX = frameWidth / naturalSize.width;
    const scaleY = frameHeight / naturalSize.height;
    const baseScale = Math.max(scaleX, scaleY);
    const displayWidth = naturalSize.width * baseScale * zoom;
    const displayHeight = naturalSize.height * baseScale * zoom;
    const maxOffsetX = Math.max(0, (displayWidth - frameWidth) / 2);
    const maxOffsetY = Math.max(0, (displayHeight - frameHeight) / 2);

    return { baseScale, maxOffsetX, maxOffsetY, displayWidth, displayHeight };
  }, [naturalSize, frameWidth, frameHeight, zoom]);

  // Clamp offset whenever zoom or natural size changes
  const clampOffset = useCallback(
    (x: number, y: number, currentZoom: number = zoom) => {
      if (!naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };
      const scaleX = frameWidth / naturalSize.width;
      const scaleY = frameHeight / naturalSize.height;
      const baseScale = Math.max(scaleX, scaleY);
      const displayWidth = naturalSize.width * baseScale * currentZoom;
      const displayHeight = naturalSize.height * baseScale * currentZoom;
      const maxX = Math.max(0, (displayWidth - frameWidth) / 2);
      const maxY = Math.max(0, (displayHeight - frameHeight) / 2);

      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [naturalSize, frameWidth, frameHeight, zoom]
  );

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Pointer drag events (supports single touch and mouse smoothly)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (touchPinchRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || touchPinchRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const rawX = dragStartRef.current.offsetX + deltaX;
    const rawY = dragStartRef.current.offsetY + deltaY;
    setOffset(clampOffset(rawX, rawY));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
  };

  // Pinch-to-zoom for dual touches
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const distance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      touchPinchRef.current = { initialDistance: distance, initialZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchPinchRef.current) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const distance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const factor = distance / touchPinchRef.current.initialDistance;
      const nextZoom = Math.min(3, Math.max(1, touchPinchRef.current.initialZoom * factor));
      setZoom(nextZoom);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
    }
  };

  const handleTouchEnd = () => {
    touchPinchRef.current = null;
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.min(3, Math.max(1, Number((zoom + delta).toFixed(2))));
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
  };

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.min(3, Math.max(1, nextZoom));
    setZoom(clamped);
    setOffset((prev) => clampOffset(prev.x, prev.y, clamped));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Crop & Export
  const handleSaveCrop = async () => {
    if (!imgRef.current || !naturalSize.width || !naturalSize.height || !file) return;

    setIsProcessing(true);
    try {
      const { baseScale, displayWidth, displayHeight } = getCoverMetrics();
      const scaleFactor = baseScale * zoom;

      const leftInDisplay = (displayWidth - frameWidth) / 2 - offset.x;
      const topInDisplay = (displayHeight - frameHeight) / 2 - offset.y;

      const sx = Math.max(0, Math.min(naturalSize.width, leftInDisplay / scaleFactor));
      const sy = Math.max(0, Math.min(naturalSize.height, topInDisplay / scaleFactor));
      const sw = Math.min(naturalSize.width - sx, frameWidth / scaleFactor);
      const sh = Math.min(naturalSize.height - sy, frameHeight / scaleFactor);

      // Target resolution: 960px along max axis for sharp, crisp quality
      const targetWidth = aspectRatio >= 1 ? 960 : Math.round(960 * aspectRatio);
      const targetHeight = aspectRatio >= 1 ? Math.round(960 / aspectRatio) : 960;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          setIsProcessing(false);
          if (!blob) {
            onCrop(file); // fallback to original file
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, '');
          const croppedFile = new File([blob], `${baseName}_cropped.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          onCrop(croppedFile);
        },
        'image/jpeg',
        0.92
      );
    } catch (err) {
      console.error('[ImageCropper] Error cropping:', err);
      setIsProcessing(false);
      onCrop(file); // graceful fallback
    }
  };

  if (!isOpen || !file || !imageSrc) return null;

  const { displayWidth, displayHeight } = getCoverMetrics();

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-900 border border-surface-700/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Framing Instructions */}
        <div className="px-4 py-2 bg-surface-950/60 border-b border-surface-800 text-[11px] text-surface-300 text-center shrink-0">
          <span>Drag the photo to position it. Zoom in or out to fit the frame perfectly.</span>
        </div>

        {/* Viewport Frame Container */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative bg-surface-950/90 flex-1 min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden p-4"
        >
          {/* Active Crop Frame */}
          <div
            style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
            className={`relative overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] ring-2 ring-white/90 cursor-grab active:cursor-grabbing touch-none select-none ${
              cropShape === 'round' ? 'rounded-full' : 'rounded-2xl'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* The Image */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={handleImageLoad}
              draggable={false}
              style={{
                width: `${displayWidth}px`,
                height: `${displayHeight}px`,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                maxWidth: 'none',
                maxHeight: 'none',
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75 ease-out"
            />

            {/* Subtle Rule-of-Thirds Grid */}
            <div
              className={`absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 transition-opacity duration-200 ${
                isDragging ? 'opacity-40' : 'opacity-20 hover:opacity-30'
              }`}
            >
              <div className="border-r border-b border-white/50" />
              <div className="border-r border-b border-white/50" />
              <div className="border-b border-white/50" />
              <div className="border-r border-b border-white/50" />
              <div className="border-r border-b border-white/50" />
              <div className="border-b border-white/50" />
              <div className="border-r border-white/50" />
              <div className="border-r border-white/50" />
              <div />
            </div>

            {/* Circular guide if round avatar */}
            {cropShape === 'round' && (
              <div className="absolute inset-0 rounded-full border border-brand-400/40 pointer-events-none" />
            )}
          </div>
        </div>

        {/* Aspect Ratio Selector (Optional) */}
        {allowedAspectRatios && allowedAspectRatios.length > 1 && (
          <div className="px-4 py-2 border-t border-surface-800 bg-surface-900/60 flex items-center justify-center gap-2 shrink-0">
            <span className="text-[11px] text-surface-400 font-medium">Aspect:</span>
            {allowedAspectRatios.map((ar) => (
              <button
                key={ar.label}
                type="button"
                onClick={() => setAspectRatio(ar.ratio)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                  Math.abs(aspectRatio - ar.ratio) < 0.01
                    ? 'bg-brand-500 text-white font-bold shadow-sm shadow-brand-500/30'
                    : 'bg-surface-800 text-surface-300 hover:text-white'
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>
        )}

        {/* Zoom & Reset Controls */}
        <div className="px-4 py-3 border-t border-surface-800 bg-surface-900/90 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleZoomChange(Number((zoom - 0.1).toFixed(2)))}
              disabled={zoom <= 1}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition disabled:opacity-30 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer h-1.5 bg-surface-700 rounded-lg appearance-none"
              />
              <span className="text-[11px] font-mono text-surface-400 w-9 text-right shrink-0">
                {zoom.toFixed(1)}x
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleZoomChange(Number((zoom + 0.1).toFixed(2)))}
              disabled={zoom >= 3}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition disabled:opacity-30 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition cursor-pointer"
              title="Reset position"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="px-4 py-3 border-t border-surface-800 bg-surface-950 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-surface-300 hover:text-white hover:bg-surface-800/80 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={isProcessing || !imageSrc}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-rose-500 hover:from-brand-600 hover:to-rose-600 rounded-xl shadow-lg shadow-brand-500/25 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
            <span>{isProcessing ? 'Processing...' : 'Save & Position'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
