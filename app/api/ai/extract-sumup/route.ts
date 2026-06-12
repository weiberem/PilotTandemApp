import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.AI_EXTRACT_MODEL ?? 'claude-haiku-4-5';

const SCHEMA = {
  type: 'object' as const,
  properties: {
    date: {
      type: ['string', 'null'] as const,
      description: 'Transaction date YYYY-MM-DD if a date header is shown, else null',
    },
    transactions: {
      type: 'array' as const,
      description: 'Each SUCCESSFUL card sale: its time and amount.',
      items: {
        type: 'object' as const,
        properties: {
          time: { type: 'string' as const, description: 'time of the transaction, HH:MM 24h' },
          amount: { type: 'number' as const, description: 'amount in CHF as a number' },
        },
        required: ['time', 'amount'] as const,
        additionalProperties: false as const,
      },
    },
    confidence: { type: 'string' as const, enum: ['high', 'medium', 'low'] as const },
  },
  required: ['date', 'transactions', 'confidence'] as const,
  additionalProperties: false as const,
};

type SumupResult = {
  date: string | null;
  transactions: { time: string; amount: number }[];
  confidence: 'high' | 'medium' | 'low';
};

/**
 * POST { image_base64, media_type } → SumUp "Sales" screenshot → successful
 * card transactions (time + amount). The client keeps the 40-CHF photo sales
 * to derive CC flight times.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  let body: { image_base64?: string; media_type?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const { image_base64, media_type } = body;
  if (!image_base64 || !media_type) {
    return NextResponse.json({ error: 'image_base64 and media_type required' }, { status: 400 });
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(media_type)) return NextResponse.json({ error: 'unsupported media type' }, { status: 400 });

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: media_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: image_base64 },
          },
          {
            type: 'text',
            text: [
              'This is a SumUp "Sales" screenshot listing card transactions.',
              'Extract every SUCCESSFUL transaction with its time (HH:MM, 24h) and amount in CHF as a number.',
              'Ignore failed, cancelled or refunded entries. If a day header (e.g. "Yesterday" with a date, or a weekday + date) is shown, return that date as YYYY-MM-DD.',
            ].join('\n'),
          },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') return NextResponse.json({ error: 'ai_refused' }, { status: 422 });
    const text = response.content.find(b => b.type === 'text');
    if (!text || text.type !== 'text') return NextResponse.json({ error: 'no_output' }, { status: 502 });
    const parsed = JSON.parse(text.text) as SumupResult;

    const transactions = (parsed.transactions ?? [])
      .map(t => ({ time: String(t.time).trim(), amount: Number(t.amount) }))
      .filter(t => /^\d{1,2}:\d{2}$/.test(t.time) && Number.isFinite(t.amount))
      .map(t => ({ time: t.time.padStart(5, '0'), amount: t.amount }));

    return NextResponse.json({
      ok: true,
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      transactions,
      confidence: parsed.confidence ?? 'low',
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `ai_error_${e.status}` }, { status: 502 });
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
}
