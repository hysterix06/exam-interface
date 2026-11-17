"use client";

import { ImageUp } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { listAssetsAction, uploadAssetAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type AssetRef, assetUrl } from "@/engine/asset";
import type { AssetSummary } from "@/server/assets";
import { useAssetCourse } from "./asset-context";

/** Upload an image or choose one already in the course, plus its alt text. */
export function AssetPicker({ value, onChange, label = "Image" }: { value: AssetRef | null; onChange: (ref: AssetRef | null) => void; label?: string }) {
  const courseId = useAssetCourse();
  const [list, setList] = useState<AssetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!courseId) return;
    let live = true;
    void listAssetsAction(courseId, "image").then((rows) => live && setList(rows));
    return () => {
      live = false;
    };
  }, [courseId]);

  const choose = (a: AssetSummary) => onChange({ assetId: a.id, width: a.width ?? 1, height: a.height ?? 1, alt: value?.alt ?? "" });

  const upload = (file: File) =>
    start(async () => {
      if (!courseId) return setError("Choose the question's topic first.");
      const form = new FormData();
      form.set("courseId", courseId);
      form.set("file", file);
      const r = await uploadAssetAction(form);
      if (!r.ok) return setError(r.error);
      setError(null);
      setList((l) => [r.asset, ...l.filter((x) => x.id !== r.asset.id)]);
      choose(r.asset);
    });

  return (
    <div className="grid gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <ImageUp /> {pending ? "Uploading…" : "Upload"}
        </Button>
        {list.length > 0 && (
          <Select
            className="w-auto min-w-48"
            aria-label="Or choose an uploaded image"
            value={value?.assetId ?? ""}
            onChange={(e) => {
              const a = list.find((x) => x.id === e.target.value);
              if (a) choose(a);
            }}
          >
            <option value="">Or choose one already uploaded…</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fileName} ({a.width}×{a.height})
              </option>
            ))}
          </Select>
        )}
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5 MB. Stored privately; students only see it inside their exam.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {value && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- access-checked redirect, not a static asset */}
          <img src={assetUrl(value.assetId)} alt={value.alt} width={value.width} height={value.height} className="h-auto max-h-64 w-auto max-w-full rounded-md border" />
          <Field label="Alt text" hint="What the image shows, for students using a screen reader, e.g. “Diagram of a plant cell with six parts numbered”.">
            <Input value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}
