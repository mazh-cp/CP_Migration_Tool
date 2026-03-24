import { NextResponse } from 'next/server';
import { runWeeklyCleanup } from '@/lib/cleanup';

const CRON_SECRET = process.env.CRON_SECRET;

/** Weekly cleanup: prune expired sessions, delete old uploads. Call with Authorization: Bearer <CRON_SECRET> */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWeeklyCleanup();
    return NextResponse.json({
      ok: true,
      ...result,
      ranAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Cleanup failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
