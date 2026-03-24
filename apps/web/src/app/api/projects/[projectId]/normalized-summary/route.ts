import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/project-access';
import { getNormalizedCounts } from '@/lib/normalized-counts';

/**
 * Array element counts only — avoids serializing huge normalized JSON (gateway 504).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  const counts = await getNormalizedCounts(projectId, tenantId);
  if (!counts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(counts);
}
