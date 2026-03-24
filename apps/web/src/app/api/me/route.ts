import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/project-access';

export async function GET() {
  const session = await requireTenantSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    username: session.username,
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email,
    isAdmin: session.role === 'admin',
  });
}
