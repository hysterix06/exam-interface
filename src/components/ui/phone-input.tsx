"use client"

import { useState, useSyncExternalStore } from "react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  formatAsYouType,
  formatPhone,
  guessRegion,
  parsePhone,
  phoneCountries,
  type PhoneInput as PhoneValue,
} from "@/lib/phone"

const subscribe = () => () => {}

/** The browser's own country guess ("" on the server and during hydration, so nothing mismatches). */
export function useGuessedRegion(): string {
  return useSyncExternalStore(
    subscribe,
    () => guessRegion(navigator.languages ?? [navigator.language]) ?? "",
    () => "",
  )
}

/**
 * State for a phone field. The country is the person's pick, else the saved one, else a guess
 * from the browser's language; the value always carries the country that is on screen.
 */
export function usePhoneField(initial?: PhoneValue) {
  const guess = useGuessedRegion()
  const [state, setState] = useState<PhoneValue>(initial ?? { raw: "", region: "" })
  const value: PhoneValue = { raw: state.raw, region: state.region || guess }
  return [value, setState, () => setState({ raw: "", region: "" })] as const
}

/**
 * Country picker + number. Typing is formatted as you go (libphonenumber's AsYouType); pasting
 * a whole number resolves the country from its + / international prefix / trunk 0 and
 * reformats it, so "0086 138 1234 5678" switches to China instead of erroring.
 */
export function PhoneInput({
  id,
  label = "Phone",
  hint,
  value,
  onChange,
  className,
}: {
  id: string
  label?: string
  hint?: React.ReactNode
  value: PhoneValue
  onChange: (v: PhoneValue) => void
  className?: string
}) {
  const countries = phoneCountries()
  return (
    <div className={cn("grid gap-2 text-sm", className)}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Select
          aria-label={`${label} country`}
          className="w-36 shrink-0 sm:w-48"
          value={value.region}
          onChange={(e) => onChange({ raw: formatAsYouType(value.raw, e.target.value), region: e.target.value })}
        >
          {value.region === "" && <option value="">Country…</option>}
          {countries.map((c) => (
            <option key={c.region} value={c.region}>
              {c.name} (+{c.callingCode})
            </option>
          ))}
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value.raw}
          onChange={(e) => {
            const text = e.target.value
            // Reformat only while typing at the end, so editing in the middle doesn't throw the caret.
            const atEnd = e.target.selectionStart === text.length
            onChange({ raw: atEnd ? formatAsYouType(text, value.region) : text, region: value.region })
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text")
            const r = parsePhone(pasted, value.region)
            if (!r.ok) return // not a whole number: let it land as typed text
            e.preventDefault()
            onChange({ raw: formatPhone(r.phone, r.region, r.region), region: r.region })
          }}
        />
      </div>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}
