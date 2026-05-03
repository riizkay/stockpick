import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeAssistantAnswerForDisplay } from "./sanitizeAssistantAnswer";

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 border-b border-slate-600/35 pb-2 text-[1.15rem] font-bold tracking-tight text-slate-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3.5 text-base font-semibold text-emerald-200/95 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-[0.95rem] font-semibold text-slate-100 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-sm font-semibold text-slate-200 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-emerald-500/80 first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-slate-500 first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  hr: () => <hr className="my-4 border-0 border-t border-slate-600/35" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-emerald-500/60 bg-slate-900/50 py-1 pl-3 pr-2 text-slate-300 [&>p]:my-1">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 transition-colors hover:text-emerald-300"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code
          className={
            "block w-full p-3 font-mono text-[12px] leading-relaxed text-slate-200 " + (className ?? "")
          }
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-slate-800/90 px-1 py-0.5 font-mono text-[0.85em] text-emerald-200/90"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-slate-600/25 bg-slate-900/80 first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-600/25 bg-slate-900/35 first:mt-0 last:mb-0">
      <table className="w-full min-w-[280px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-slate-600/30 bg-slate-900/70">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-slate-600/20">{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors hover:bg-slate-800/30">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-200">{children}</th>
  ),
  td: ({ children }) => (
    <td className="break-words px-3 py-2 align-top text-slate-300">{children}</td>
  ),
};

type ChatMessageMarkdownProps = {
  content: string;
};

export function ChatMessageMarkdown({ content }: ChatMessageMarkdownProps) {
  const safe = sanitizeAssistantAnswerForDisplay(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {safe}
    </ReactMarkdown>
  );
}
