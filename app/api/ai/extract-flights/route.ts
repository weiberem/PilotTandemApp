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
      description: "Departure times of THIS pilot's flights, format HH:MM, ascending",
      items: { type: 'string' as const },
    },
    confidence: {
      type: 'string' as const,
      enum: ['high', 'medium', 'low'] as const,
      description: 'How confident the extraction is',
    },
  },
  required: ['date', 'trip_times', 'confidence'] as const,
  additionalProperties: false as const,
};

export type ExtractResult = {
  date: string | null;
  trip_times: string[];
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
              `This is a screenshot of a tandem-paragliding daysheet or a WhatsApp message listing flights.`,
              `The pilot's name is "${pilot?.full_name ?? 'unknown'}".`,
              `Extract the departure times (HH:MM) of THIS pilot's flights only.`,
              `If the screenshot shows a whole-team plan, find the row/section for this pilot.`,
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

    return NextResponse.json({
      ok: true,
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      trip_times: times,
      count: times.length,
      confidence: parsed.confidence ?? 'low',
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `ai_error_${e.status}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
}
