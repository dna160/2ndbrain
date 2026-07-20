/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/google/calendar.client.ts
 * Role    : Google Calendar API v3 — incremental list (syncToken; 410 → invalid), and
 *           insert/patch/delete for confirmed drafts. Access token from a provider (Clerk OAuth).
 */
export interface GCalAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export interface GCalEvent {
  id: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: GCalAttendee[];
}

export interface CalendarListResult {
  events: GCalEvent[];
  nextSyncToken?: string;
  invalidToken?: boolean;
}

export interface CalendarInsert {
  summary: string;
  startISO: string;
  endISO: string;
  attendees?: string[];
}

export interface GoogleCalendarClient {
  list(syncToken?: string): Promise<CalendarListResult>;
  insert(input: CalendarInsert): Promise<{ id: string }>;
  patch(id: string, input: Partial<CalendarInsert>): Promise<void>;
  remove(id: string): Promise<void>;
}

export class GoogleApiCalendarClient implements GoogleCalendarClient {
  constructor(
    private readonly tokenProvider: () => Promise<string>,
    private readonly calendarId = 'primary',
    private readonly base = 'https://www.googleapis.com/calendar/v3',
  ) {}

  private async headers(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.tokenProvider()}`, 'content-type': 'application/json' };
  }

  private eventsUrl(suffix = ''): string {
    return `${this.base}/calendars/${encodeURIComponent(this.calendarId)}/events${suffix}`;
  }

  async list(syncToken?: string): Promise<CalendarListResult> {
    const url = new URL(this.eventsUrl());
    if (syncToken) url.searchParams.set('syncToken', syncToken);
    else {
      url.searchParams.set('timeMin', new Date().toISOString());
      url.searchParams.set('singleEvents', 'true');
    }
    const res = await fetch(url, { headers: await this.headers() });
    if (res.status === 410) return { events: [], invalidToken: true }; // syncToken expired → full resync
    if (!res.ok) throw new Error(`gcal list failed: ${res.status}`);
    const json = (await res.json()) as { items?: GCalEvent[]; nextSyncToken?: string };
    return { events: json.items ?? [], nextSyncToken: json.nextSyncToken };
  }

  async insert(input: CalendarInsert): Promise<{ id: string }> {
    const res = await fetch(this.eventsUrl(), {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(this.toGcal(input)),
    });
    if (!res.ok) throw new Error(`gcal insert failed: ${res.status}`);
    const json = (await res.json()) as { id: string };
    return { id: json.id };
  }

  async patch(id: string, input: Partial<CalendarInsert>): Promise<void> {
    const res = await fetch(this.eventsUrl(`/${id}`), {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(this.toGcal(input)),
    });
    if (!res.ok) throw new Error(`gcal patch failed: ${res.status}`);
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(this.eventsUrl(`/${id}`), { method: 'DELETE', headers: await this.headers() });
    if (!res.ok && res.status !== 410) throw new Error(`gcal delete failed: ${res.status}`);
  }

  private toGcal(input: Partial<CalendarInsert>): Record<string, unknown> {
    return {
      summary: input.summary,
      start: input.startISO ? { dateTime: input.startISO } : undefined,
      end: input.endISO ? { dateTime: input.endISO } : undefined,
      attendees: input.attendees?.map((email) => ({ email })),
    };
  }
}
