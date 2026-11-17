import { cn } from "cn"
import { formatPhone, phoneHref } from "@/lib/phone"

/**
 * A phone number as a tap-to-call link. The one place a stored number is rendered:
 * shown nationally to someone in the same region and internationally to everyone else,
 * linked as the bare E.164 `tel:` URI either way.
 */
export function PhoneLink({
  phone,
  region,
  viewerRegion,
  className,
}: {
  phone: string | null | undefined
  region: string | null | undefined
  /** The viewer's own region (their saved phone region), or null for international notation. */
  viewerRegion: string | null | undefined
  className?: string
}) {
  if (!phone) return null
  return (
    <a href={phoneHref(phone)} className={cn("text-brand underline-offset-4 hover:underline", className)}>
      {formatPhone(phone, region ?? "", viewerRegion)}
    </a>
  )
}
