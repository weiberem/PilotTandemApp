import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Haiku: cheapest vision-capable model — a screenshot scan costs a fraction
// of a Rappen. Override via env if extraction quality ever needs a bump.
const MODEL = process.env.AI_EXTRACT_MODEL ?? 'claude-haiku-4-5';

const SCHEMA = {
  type: 'object' as const,
  properties: {
    date: {
      type: ['string', 'null'] as const,
      description: 'Flight date in YYYY-MM-DD if visible in the screenshot, else null',
    },
    trip_times: {
      type: 'array' as const,
      description: "If the screenshot lists departure times, THIS pilot's times in HH:MM ascending. Empty if it's a counts summary.",
      items: { type: 'string' as const },
    },
    flights_count: {
      type: ['integer', 'null'] as const,
      description: "Counts-summary layout only: number in THIS pilot's 'Flights' column. Null if the screenshot lists times instead.",
    },
    photo_count: {
      type: ['integer', 'null'] as const,
      description: "Counts-summary layout: THIS pilot's 'Photo'/'Photo Video' column, else null.",
    },
    double_air_count: {
      type: ['integer', 'null'] as const,
      description: "Counts-summary layout: THIS pilot's 'Double Air'/'Doppel'/thermal column, else null.",
    },
    no_show_count: {
      type: ['integer', 'null'] as const,
      description: "Counts-summary layout: THIS pilot's 'No Show' column, else null.",
    },
    confidence: {
      type: 'string' as const,
      enum: ['high', 'medium', 'low'] as const,
      description: 'How confident the extraction is',
    },
  },
  required: ['date', 'trip_times', 'flights_count', 'photo_count', 'double_air_count', 'no_show_count', 'confidence'] as const,
  additionalProperties: false as const,
};

export type ExtractResult = {
  date: string | null;
  trip_times: string[];
  flights_count: number | null;
  photo_count: number | null;
  double_air_count: number | null;
  no_show_count: number | null;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * POST { image_base64, media_type } → extracted flights from a daysheet /
 * WhatsApp screenshot. Costs ~0.002 CHF per call on Haiku.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  let body: { image_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { image_base64, media_type } = body;
  if (!image_base64 || !media_type) {
    return NextResponse.json({ error: 'image_base64 and media_type required' }, { status: 400 });
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(media_type)) {
    return NextResponse.json({ error: 'unsupported media type' }, { status: 400 });
  }

  // Pilot's name helps the model pick the right row in a multi-pilot daysheet.
  const { data: pilot } = await sb.from('pilots').select('full_name').eq('id', user.id).maybeSingle();

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: media_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: image_base64,
            },
          },
          {
            type: 'text',
            text: [
              `This is a screenshot of a tandem-paragliding daysheet or a WhatsApp message about flights.`,
              `The pilot's name is "${pilot?.full_name ?? 'unknown'}". Always work from THIS pilot's row/section only.`,
              ``,
              `There are two possible layouts:`,
              `1) A LIST OF DEPARTURE TIMES → return them in "trip_times" (HH:MM, ascending) and leave the *_count fields null.`,
              `2) A COUNTS SUMMARY TABLE with columns like "Pilot Name", "Flights", "Photo"/"Photo Video", "Double Air"/"Doppel", "No Show" → return this pilot's numbers in flights_count / photo_count / double_air_count / no_show_count, and leave trip_times empty.`,
              ``,
              `Note the pilot's name may be abbreviated (e.g. first name only). Pick the best-matching row.`,
              `If you see a date, return it as YYYY-MM-DD. Set confidence accordingly.`,
            ].join('\n'),
          },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'ai_refused' }, { status: 422 });
    }
    const text = response.content.find(b => b.type === 'text');
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'no_output' }, { status: 502 });
    }
    const parsed = JSON.parse(text.text) as ExtractResult;
    // Normalize times: keep only HH:MM-looking values, dedupe, sort.
    const times = [...new Set(
      (parsed.trip_times ?? [])
        .map(t => t.trim())
        .filter(t => /^\d{1,2}:\d{2}$/.test(t))
        .map(t => t.padStart(5, '0')),
    )].sort();

    const clampCount = (n: number | null | undefined): number | null =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 99) : null;

    return NextResponse.json({
      ok: true,
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      trip_times: times,
      count: times.length,
      flights_count: clampCount(parsed.flights_count),
      photo_count: clampCount(parsed.photo_count),
      double_air_count: clampCount(parsed.double_air_count),
      no_show_count: clampCount(parsed.no_show_count),
      confidence: parsed.confidence ?? 'low',
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `ai_error_${e.status}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
}
