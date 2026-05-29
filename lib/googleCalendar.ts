/**
 * Google Calendar push — writes the pilot's Skywings-scheduled days into
 * their Google Calendar as all-day-ish events with the trip-time window.
 *
 * Uses the same OAuth token as Drive (scope calendar.events added in
 * lib/googleDrive.ts). Plain fetch against the Calendar v3 REST API.
 *
 * Idempotency: every event we create carries a private extended property
 * `tandemlog=<source>:<date>`. Before inserting for a date we look it up and
 * patch instead of duplicating, so re-syncing the same month never creates
 * doubles.
 */

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TZ = 'Europe/Zurich';
const TAG_KEY = 'tandemlog';

export type CalendarEntry = {
  date: string;          // YYYY-MM-DD
  summary: string;       // e.g. "Skywings — Ganztag"
  startTime: string;     // "HH:MM" local
  endTime: string;       // "HH:MM" local
  description?: string;
};

type ExistingEvent = { id: string };

async function findTaggedEvent(
  calendarId: string,
  tag: string,
  accessToken: string,
): Promise<ExistingEvent | null> {
  const params = new URLSearchParams({
    privateExtendedProperty: `${TAG_KEY}=${tag}`,
    maxResults: '1',
    showDeleted: 'false',
  });
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`calendar list failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { items?: ExistingEvent[] };
  return data.items?.[0] ?? null;
}

function eventBody(entry: CalendarEntry, tag: string) {
  return {
    summary: entry.summary,
    description: entry.description ?? 'Automatisch aus dem Skywings-Einsatzplan (TandemLog).',
    start: { dateTime: `${entry.date}T${entry.startTime}:00`, timeZone: TZ },
    end: { dateTime: `${entry.date}T${entry.endTime}:00`, timeZone: TZ },
    extendedProperties: { private: { [TAG_KEY]: tag } },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] },
  };
}

/**
 * Upsert one calendar event for a scheduled day. `source` namespaces the tag
 * (e.g. "skywings") so different sync sources don't collide.
 */
export async function upsertCalendarEvent(
  entry: CalendarEntry,
  accessToken: string,
  source = 'skywings',
  calendarId = 'primary',
): Promise<{ action: 'created' | 'updated' }> {
  const tag = `${source}:${entry.date}`;
  const existing = await findTaggedEvent(calendarId, tag, accessToken);
  const body = JSON.stringify(eventBody(entry, tag));

  if (existing) {
    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${existing.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body,
      },
    );
    if (!res.ok) throw new Error(`calendar update failed: ${res.status} ${await res.text()}`);
    return { action: 'updated' };
  }

  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body,
    },
  );
  if (!res.ok) throw new Error(`calendar insert failed: ${res.status} ${await res.text()}`);
  return { action: 'created' };
}
  entry: CalendarEntry,
  accessToken: string,
  source = 'skywings',
  calendarId = 'primary',
): Promise<{ action: 'created' | 'updated' }> {
  const tag = `${source}:${entry.date}`;
  const existing = await findTaggedEvent(calendarId, tag, accessToken);
  const body = JSON.stringify(eventBody(entry, tag));

  if (existing) {
    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${existing.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body,
      },
    );
    if (!res.ok) throw new Error(`calendar update failed: ${res.status} ${await res.text()}`);
    return { action: 'updated' };
  }

  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body,
    },
  );
  if (!res.ok) throw new Error(`calendar insert failed: ${res.status} ${await res.text()}`);
  return { action: 'created' };
}
