import "katex/dist/katex.min.css"
import Markdown, { defaultUrlTransform, type Components } from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { cn } from "cn"

// Question text is Markdown plus maths. Deliberately narrow:
// - No raw HTML (skipped), so authors can't inject markup or scripts.
// - Maths is $$…$$ (inline mid-sentence, display on its own line). Single
//   dollars stay literal so "$12.50 each" in a price question isn't maths.
// - Images only from the course's own uploads: ![alt](asset:<id>). Anything
//   else would let a question load third-party URLs (tracking pixels).
// - Line breaks are kept as typed, as plain text did before.

const remarkPlugins = [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]] as const
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: "ignore", trust: false }]] as const

export const ASSET_PREFIX = "asset:"

/** asset:<id> -> the access-checked asset route; other images are dropped; links keep the safe default. */
function urlTransform(url: string, key: string) {
  if (url.startsWith(ASSET_PREFIX)) {
    const id = url.slice(ASSET_PREFIX.length)
    return /^[0-9a-f-]{36}$/i.test(id) ? `/assets/${id}` : ""
  }
  if (key === "src") return ""
  return defaultUrlTransform(url)
}

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline underline-offset-2">
      {children}
    </a>
  ),
  // eslint-disable-next-line @next/next/no-img-element -- access-checked redirect, not a static asset
  img: ({ src, alt }) => (src ? <img src={String(src)} alt={alt ?? ""} className="my-2 max-h-96 max-w-full rounded-md border" /> : null),
}

const inlineComponents: Components = { ...components, p: ({ children }) => <>{children}</> }

/**
 * Rendered question text. `inline` drops paragraph wrappers so it can sit
 * inside a label, a cloze sentence or an option.
 */
function Prose({ children, inline = false, className, id }: { children: string; inline?: boolean; className?: string; id?: string }) {
  const body = (
    <Markdown
      remarkPlugins={remarkPlugins as never}
      rehypePlugins={rehypePlugins as never}
      skipHtml
      urlTransform={urlTransform}
      components={inline ? inlineComponents : components}
    >
      {children}
    </Markdown>
  )
  return inline ? (
    <span id={id} className={cn("prose-exam", className)}>
      {body}
    </span>
  ) : (
    <div id={id} className={cn("prose-exam", className)}>
      {body}
    </div>
  )
}

export { Prose }
