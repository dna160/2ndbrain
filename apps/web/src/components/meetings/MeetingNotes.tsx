'use client';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

/**
 * Renders Plaud's meeting-note markdown (headings, bold, bullet/numbered/task lists, and
 * `>` callout blocks like "Informasi Rapat" / "Saran AI") as readable prose. Plaud stores the
 * whole note as one markdown string; without this it renders as raw `##`/`**`. GFM is required
 * for the `- [ ]` action-item checkboxes. No raw HTML is rendered (react-markdown default).
 */
export function MeetingNotes({ markdown }: { markdown: string }) {
  return (
    <div className="md-prose">
      {/* remark-breaks: Plaud uses single newlines as intentional line breaks (esp. in the
          Informasi Rapat / Saran AI callouts); CommonMark would otherwise collapse them. */}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdown}</ReactMarkdown>
    </div>
  );
}
