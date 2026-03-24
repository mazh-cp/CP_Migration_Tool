/**
 * Seed: create default tenant and optionally first admin user.
 * Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
 * Or: npx prisma db seed (if configured in package.json)
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
  } else {
    console.log('Default tenant exists:', tenant.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
