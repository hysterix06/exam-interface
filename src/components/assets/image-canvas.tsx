"use client";

import { useRef } from "react";
import { cn } from "cn";
import { type AssetRef, assetUrl } from "@/engine/asset";
import type { Point } from "@/engine/geometry";

/** An uploaded image with an SVG layer on top in 0–1 coordinates (viewBox 0 0 1 1, stretched to the image). */
export function ImageCanvas({
  image,
  children,
  onPoint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className,
  label,
}: {
  image: AssetRef;
  children?: React.ReactNode;
  onPoint?: (p: Point) => void;
  onPointerDown?: (p: Point) => void;
  onPointerMove?: (p: Point) => void;
  onPointerUp?: (p: Point) => void;
  className?: string;
  /** Accessible name for the drawing surface. */
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const toPoint = (e: React.PointerEvent | React.MouseEvent): Point => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <div className={cn("relative inline-block max-w-full select-none", className)} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- access-checked redirect, not a static asset */}
      <img src={assetUrl(image.assetId)} alt={image.alt} width={image.width} height={image.height} className="block h-auto w-full rounded-md border" draggable={false} />
      <svg
        ref={ref}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        role={label ? "img" : undefined}
        aria-label={label}
        className={cn("absolute inset-0 h-full w-full touch-none", (onPoint || onPointerDown) && "cursor-crosshair")}
        onClick={onPoint ? (e) => onPoint(toPoint(e)) : undefined}
        onPointerDown={onPointerDown ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); onPointerDown(toPoint(e)); } : undefined}
        onPointerMove={onPointerMove ? (e) => onPointerMove(toPoint(e)) : undefined}
        onPointerUp={onPointerUp ? (e) => onPointerUp(toPoint(e)) : undefined}
      >
        {children}
      </svg>
    </div>
  );
}

/** Stroke widths in the 0–1 viewBox that look the same at any size. */
export const HAIRLINE = { vectorEffect: "non-scaling-stroke" as const, strokeWidth: 2 };
