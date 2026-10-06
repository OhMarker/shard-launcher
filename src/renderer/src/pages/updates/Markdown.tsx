import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'

const remarkPlugins = [remarkGfm]

/** Links open in the system browser; the renderer window never navigates away. */
const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href && /^https?:\/\//i.test(href)) openExternal(href)
      }}
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />
}

export interface MarkdownProps {
  children: string
  className?: string
  /** Tighter headings and spacing for preview cards. */
  compact?: boolean
}

/** GitHub-flavoured markdown inside the `.prose-shard` typography. */
export function Markdown({ children, className, compact }: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose-shard selectable text-sm',
        compact &&
          'text-[13px] [&_h1]:mt-2 [&_h1]:text-[15px] [&_h2]:mt-2 [&_h2]:text-sm [&_h3]:mt-2 [&_h3]:text-[13px] [&_li]:my-0 [&_p]:my-1 [&_ul]:my-1',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
