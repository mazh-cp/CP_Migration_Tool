/**
 * Backfill tenantId for existing data. Run once after deploying the new schema.
 * Creates default tenant if missing, assigns all existing projects and related records to it,
 * and ensures all users have a primary tenant membership.
 *
 * Run from apps/web: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-tenant.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Default', slug: 'default' },
    });
    console.log('Created default tenant:', tenant.id);
  }
  const tenantId = tenant.id;

  const projects = await prisma.project.findMany({ where: { tenantId: null }, select: { id: true } });
  if (projects.length > 0) {
    await prisma.project.updateMany({ where: { tenantId: null }, data: { tenantId } });
    console.log('Backfilled tenantId for', projects.length, 'projects');
  }

  await prisma.rawArtifact.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.normalizedData.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.interfaceMappingRecord.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.mappingDecisionRecord.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.validationOverride.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.job.updateMany({ where: { tenantId: null }, data: { tenantId } });

  const users = await prisma.user.findMany({
    select: { id: true, username: true, isPlatformAdmin: true },
  });
  const envBootstrapUser = process.env.AUTH_USERNAME?.trim();
  for (const user of users) {
    const existing = await prisma.tenantMembership.findFirst({
      where: { userId: user.id, tenantId, status: 'active' },
    });
    if (!existing) {
      const isBootstrap =
        user.isPlatformAdmin ||
        !!(envBootstrapUser && user.username === envBootstrapUser);
      await prisma.tenantMembership.upsert({
        where: {
          tenantId_userId: { tenantId, userId: user.id },
        },
        create: {
          tenantId,
          userId: user.id,
          role: isBootstrap ? 'admin' : 'member',
          isPrimary: true,
          status: 'active',
        },
        update: {
          isPrimary: true,
          status: 'active',
          ...(isBootstrap ? { role: 'admin' as const } : {}),
        },
      });
      if (isBootstrap && envBootstrapUser && user.username === envBootstrapUser && !user.isPlatformAdmin) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isPlatformAdmin: true },
        });
      }
      console.log('Added primary membership for user', user.id);
    }
  }

  const platformAdmins = users.filter((u) => u.isPlatformAdmin).map((u) => u.id);
  if (platformAdmins.length > 0) {
    const fixed = await prisma.tenantMembership.updateMany({
      where: {
        tenantId,
        userId: { in: platformAdmins },
        status: 'active',
        role: { not: 'admin' },
      },
      data: { role: 'admin' },
    });
    if (fixed.count > 0) {
      console.log('Promoted', fixed.count, 'platform admin tenant membership(s) to admin');
    }
  }

  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
