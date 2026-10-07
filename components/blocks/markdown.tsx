"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/** Safe Markdown: raw HTML is not rendered and links open safely. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-lite">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
          img: ({ src, alt }) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" className="my-2 max-w-full rounded-lg" /> : null),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
