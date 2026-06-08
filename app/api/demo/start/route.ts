import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomUUID, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { seedDemoPilot } from '@/lib/demoSeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_LIFETIME_HOURS = 24;

export async function POST(req: NextRequest) {
  const svc = createServiceClient();
  const id = randomUUID();
  const email = `demo-${id}@tandemlog.demo`;
  const password = randomBytes(24).toString('base64url');

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Pilot' },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? 'create_failed' },
      { status: 500 },
    );
  }
  const userId = created.user.id;

  const expiresAt = new Date(Date.now() + DEMO_LIFETIME_HOURS * 3_600_000).toISOString();
  const { error: pilotErr } = await svc.from('pilots').upsert({
    id: userId,
    full_name: 'Demo Pilot',
    address_line1: 'Tandemweg 7',
    address_line2: null,
    postal_code: '3812',
    city: 'Wilderswil',
    iban: 'CH9300762011623852957',
    primary_company_name: 'Skywings Adventures GmbH',
    primary_company_address: 'Brandstrasse 38, 3852 Ringgenberg',
    office_email: 'demo-office@tandemlog.demo',
    personal_email: email,
    flight_rate_chf: 105,
    photo_prepaid_rate_chf: 40,
    thermal_rate_chf: 50,
    no_show_rate_chf: 32,
    is_active: true,
    is_demo: true,
    demo_expires_at: expiresAt,
  }, { onConflict: 'id' });
  if (pilotErr) {
    return NextResponse.json({ error: pilotErr.message }, { status: 500 });
  }

  try {
    await seedDemoPilot(svc, userId);
  } catch (e) {
    console.warn('Demo seed failed (continuing):', e);
  }

  // Sign the visitor in via the SSR adapter so the auth cookies land on the
  // response and the redirect immediately drops them into /home.
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        },
      },
    },
  );
  const { error: signErr } = await sb.auth.signInWithPassword({ email, password });
  if (signErr) {
    return NextResponse.json({ error: signErr.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/home', req.url), { status: 303 });
}
