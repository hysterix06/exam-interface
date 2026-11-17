import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose } from "./prose";

const html = (md: string, inline = false) => renderToStaticMarkup(Prose({ inline, children: md }));

describe("Prose", () => {
  it("renders Markdown and $$maths$$", () => {
    const out = html("**Bold** and $$x^2$$");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain('class="katex"');
  });

  it("leaves single dollars as money", () => {
    const out = html("Costs $12.50 each, $3 off");
    expect(out).toContain("$12.50 each, $3 off");
    expect(out).not.toContain("katex");
  });

  it("drops raw HTML and third-party images, keeps asset images", () => {
    expect(html("<script>alert(1)</script>hi")).not.toContain("<script");
    expect(html("![x](https://evil.example/p.gif)")).not.toContain("evil.example");
    const id = "0b5e6f9a-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
    expect(html(`![cell](asset:${id})`)).toContain(`src="/assets/${id}"`);
    expect(html("![x](asset:../../etc)")).not.toContain("etc");
  });

  it("keeps typed line breaks and opens links safely", () => {
    expect(html("one\ntwo")).toContain("<br/>");
    expect(html("[site](https://example.com)")).toContain('rel="noopener noreferrer nofollow"');
    expect(html("[bad](javascript:alert(1))")).not.toContain("javascript:");
  });

  it("inline mode has no paragraph wrapper", () => {
    expect(html("just *text*", true)).toBe('<span class="prose-exam">just <em>text</em></span>');
  });
});
