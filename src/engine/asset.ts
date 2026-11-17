import { z } from "zod";
import type { PreflightIssue } from "./types";

/**
 * How a question refers to an uploaded image: by id (never a URL), with its
 * size so layouts and coordinates don't wait for the download, and alt text
 * for screen readers. Regions and pins use 0–1 coordinates, so they survive
 * the image being shown at any size.
 */
export const assetRefSchema = z.object({
  assetId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

/** Where the browser fetches it: the access-checked route. */
export const assetUrl = (assetId: string) => `/assets/${assetId}`;

export function checkAssetRef(ref: AssetRef | null | undefined, code: string, path: string, required = true): PreflightIssue[] {
  if (!ref || !ref.assetId) return required ? [{ severity: "blocking", code: `${code}.no-image`, message: "Upload or choose an image.", path }] : [];
  if (!ref.alt.trim()) {
    return [{ severity: "blocking", code: `${code}.no-alt`, message: "Describe the image in a few words (alt text) for students who can't see it.", path: `${path}.alt` }];
  }
  return [];
}
