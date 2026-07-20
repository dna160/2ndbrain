# 02 — Design System & UX Specification

This document is law for `apps/web`. Deviations require `[REVISED: reason]` in the phase
DONE file. The bar: **Gmail-grade productivity tool** — dense, calm, every pixel purposeful,
navigable blind on a keyboard. Recall is an instrument panel for an operator, not a marketing
site. No decoration. Restraint executed with precision.

## 1. Design direction

The subject is *operational intelligence*: transcripts, timelines, commitments, a relationship
graph. The aesthetic follows the subject — ledger-like clarity, monospaced data accents,
one signature element. **Signature: the Topic Scrubber** — a horizontal time bar atop every
meeting note where topics render as labeled blocks; hover previews subnotes, click scrolls
the transcript and flashes the segment. It is the one memorable element; everything else
stays quiet.

Light-first (operator works in daylight), dark mode supported via tokens.

## 2. Tokens (`styles/tokens.css`)

```css
:root {
  /* color — neutral ink ramp + single functional accent */
  --bg: #FAFAF9;          /* app background (warm off-white, not cream-trend) */
  --surface: #FFFFFF;     /* panes, cards */
  --surface-2: #F4F4F3;   /* hovered rows, wells */
  --border: #E4E4E2;
  --ink: #1A1A18;         /* primary text */
  --ink-2: #5C5C58;       /* secondary text */
  --ink-3: #8F8F8A;       /* metadata, timestamps */
  --accent: #1F5FBF;      /* actions, links, focus — one blue, used sparingly */
  --accent-weak: #E8F0FC;
  --ok: #1E7F4F; --warn: #B0730F; --err: #B3372E;
  --sensitive: #7A4FBF;   /* sensitivity-flagged memory indicator */

  /* type */
  --font-ui: "Inter", system-ui, sans-serif;
  --font-data: "JetBrains Mono", monospace;  /* timestamps, ids, costs, speaker keys */
  --text-xs: 11px; --text-sm: 12.5px; --text-md: 14px; --text-lg: 16px; --text-xl: 20px;
  --leading: 1.45;

  /* space — 4px grid */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;

  /* shape & motion */
  --radius: 6px; --radius-lg: 10px;
  --shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  --t-fast: 120ms ease; --t-med: 200ms ease;
}
[data-theme="dark"] { --bg:#111110; --surface:#1A1A19; --surface-2:#232322;
  --border:#2E2E2C; --ink:#EDEDEA; --ink-2:#A5A5A0; --ink-3:#6E6E69;
  --accent:#6FA3F0; --accent-weak:#1B2A44; }
```

Rules: body text `--text-md`; row metadata `--text-sm` in `--ink-3`; timestamps/costs/ids
always `--font-data`. Accent appears only on interactive elements and the focused state —
never as decoration. `prefers-reduced-motion` disables all transitions.

## 3. Shell layout (the Gmail skeleton)

```
┌──┬──────────────┬──────────────────────────────┐
│N │  List pane   │        Detail pane           │
│a │  (360px)     │        (fluid)               │
│v │              │                              │
│56│ dense rows   │ selected object              │
└──┴──────────────┴──────────────────────────────┘
```

- **Nav rail (56px):** icon-only, tooltip labels — Today, Conversations, Upcoming, Actions,
  Meetings, Digests, Memory, Pipeline, Settings. Conversations icon carries an unread badge. Active = accent left-notch, not a filled pill.
- **List pane:** virtualized dense rows (36–44px), single-line primary + metadata line only
  where needed. Unread/needs-attention = 600-weight primary text, exactly like Gmail.
- **Detail pane:** the object. Actions in a slim toolbar at top, never floating FABs.
- Mobile (PWA): panes stack; rail becomes bottom bar; scrubber stays horizontal-scrollable.
- ⌘K command palette over everything: navigate, search memory, retry run, jump to entity.

## 4. Keyboard model (implement in `lib/keyboard.ts`, global)

`j/k` row navigation · `enter` open · `esc` back/close · `g t/c/u/a/m/d/y/p` go-to view ·
`r` focus reply composer (in a thread) · `⌘enter` send reply ·
`e` mark task done · `c` confirm (draft/participant/review) · `x` reject ·
`/` focus search · `⌘k` palette · `[`/`]` prev/next topic inside a meeting.
Every interactive element has a visible focus ring (`2px var(--accent)` offset 2px).

## 5. View specifications

### Today
Single chronological timeline of the day's events (WA capture, meetings completed, calendar
items), grouped by hour, WIB. Right column (detail pane): today's digest if generated, else
"tonight at 21:00" state. Zero configuration widgets.

### Conversations
Filter tabs above the list (text tabs): All / Personal / Bot-handled. Search across
threads (`/`).
Gmail-density thread list: contact label (or waId if unlabeled) · "Bot active" chip on
bot-handled threads · last message preview (single
line, truncated) · time (mono) · unread = 600-weight, exactly like an unread email row.
Detail pane = chat thread: date separators; inbound left / outbound right, both restrained
(no bubbly chat-app styling — flat `--surface-2` blocks, `--radius`); audio messages render
a player + "View meeting note" link when a transcript exists; media as compact attachments.
Reply composer pinned at bottom: single-line grows to 4, `⌘enter` sends, attach button for
images/docs. On bot-active threads the first send raises a ConfirmBar: "Replying pauses the
assistant for this chat for 24h — Continue?" → thread header then shows "Assistant paused ·
resumes {time}" with a Resume action. Thread header overflow menu: Rename label · Pause/
resume assistant · Blacklist ("Stop saving this conversation" + optional "Also delete
stored history"). **Window state is explicit:** outside Meta's 24h window the composer swaps to
template mode with the notice "Free-form replies unavailable — last message from {name} was
over 24h ago. Send a template to reopen the conversation." Sent replies get a mono delivery
tick (sent/delivered/read from Meta status callbacks if relayed, else sent-only). Failures
render inline under the message: cause + Retry. Opening a thread marks it read.
Empty state: "No conversations yet. Messages to your WhatsApp number will appear here."

### Upcoming
7-day agenda list. Conflicts get a `--warn` left bar + "overlaps with X" metadata line.
`calendarDrafts` render as rows with `Proposed` chip → detail pane shows diff-style payload
with **Confirm** / **Reject** (accent / ghost). Confirmed → toast "Added to Google Calendar."

### Actions
Task rows: checkbox · title (EN-normalized) · owner entity chip · due date (mono) · source
link ("from Meeting: Genchai supplier call" → deep-links to topic timestamp). Filters as
plain text tabs: Open / Done / All. No kanban. No drag.

### Meetings (list + detail)
List row: title · date (mono) · duration · participant chips · attribution-confidence dot
(ok ≥70%, warn <70%). Detail pane order:
1. **Topic Scrubber** (signature element) — time bar, topic blocks, playhead if audio present.
2. **Summary block** — per-topic notes (collapsible), Decisions, **Next actions** (each with
   "add to Actions" one-tap), Open questions.
3. **Recommendations** — one card per participant: entity chip + advice. Sensitive-sourced
   recommendations show the `--sensitive` dot.
4. **Transcript** — speaker-keyed segments, mono timestamps in gutter, unconfirmed speakers
   render as "Speaker A — *suggested: Budi* [confirm]" inline chip. Click timestamp seeks audio.
Empty state: "No meetings yet. Forward a voice note to your Recall number or upload audio." + upload button.

### Digests
List by date; detail renders the digest sections; `deliveredVia` chip (freeform / template /
none+reason). "Re-send to WhatsApp" action.

### Memory
Three tabs (text tabs, not pills): **Graph** — force-directed canvas, node size = salience,
edge weight = strength, click node → side panel entity card (profile, memories, links,
provenance links); kind filter row. **Entities** — searchable dense list → entity page.
**Review** — queue rows: proposed memory text · reason chip · evidence excerpt →
`c` approve / `x` reject / `enter` edit-then-approve. Badge count on the Memory rail icon.
T3 core memory editor lives in the entity page for `isCore` items + Settings.

### Pipeline
Live header strip: per-queue depth (waiting/active/failed) polled every 5s, mono numbers.
Run rows: jobType · ref · status dot · duration · cost (Rp, mono) · started. Detail pane:
**StageTimeline** — horizontal stages with per-stage ms, failed stage in `--err` with the
error payload in a mono well, **Retry** button (idempotent), token/STT/cost breakdown.
This view is how the operator trusts the system; treat it as a first-class product surface.

### Settings
Blacklist (blocked waId rows, unblock, per-row purge status) · Personal contacts (synced
label list; note: bot-suppression lives in Lynkbot) · Connected calendar (Clerk-managed,
status + resync) ·
Core memory editor (ordered list, drag to reorder allowed here only) · Digest hour ·
Language normalization toggle.

## 6. Component inventory (build in `components/ui` first)

Row, Chip, Toolbar, SplitPane, VirtualList, MonoBadge, StatusDot, EmptyState, ConfirmBar,
Toast, Well (mono error/code block), Tabs (text), SearchInput, Kbd. No component library
imports for these — primitives are ~40 lines each and owning them keeps the density exact.
Charts (Pipeline mini-sparklines) may use recharts. GraphView may use d3-force.

## 7. UX writing rules

Sentence case everywhere. Buttons say what happens: "Confirm draft," "Retry run," "Approve
memory." Errors state cause + fix: "Transcription failed — audio unreadable. Retry or
re-upload." Never apologize, never vague. Empty states are invitations with one action.
Timestamps: `14:32` WIB; dates: `18 Jul`. Bilingual content renders as-is; UI chrome is EN.

## 8. Accessibility & performance floor

WCAG AA contrast on all token pairs (verify in CI with axe) · full keyboard operability ·
focus visible always · `aria-live=polite` on toasts and queue-depth updates · list
virtualization for >100 rows · route-level code splitting · LCP <2.0s on Fast 3G for list
views · no layout shift on pane swaps (fixed pane widths).
