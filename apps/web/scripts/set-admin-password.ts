/**
 * Set or reset the admin user's password in the database.
 * Use when you can't log in (e.g. .env not loaded or DB user has wrong password).
 *
 * Run from repo root: cd apps/web && npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-admin-password.ts <password>
 * Or with username: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-admin-password.ts admin changeme
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const username = args.length === 2 ? args[0] : process.env.AUTH_USERNAME?.trim() || 'admin';
  const password = args.length === 2 ? args[1] : args[0];
  if (!password) {
    console.error('Usage: set-admin-password.ts [username] <password>');
    console.error('Example: set-admin-password.ts changeme');
    console.error('Example: set-admin-password.ts admin changeme');
    process.exit(1);
  }

  let user = await prisma.user.findUnique({ where: { username } });
  const passwordHash = await bcrypt.hash(password, 10);

  if (!user) {
    user = await prisma.user.create({
      data: { username, passwordHash, isPlatformAdmin: true },
    });
    let tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } });
    if (!tenant) {
      tenant = await prisma.tenant.create({ data: { name: 'Default', slug: 'default' } });
    }
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role: 'admin', isPrimary: true, status: 'active' },
      update: {},
    });
    console.log(`Created user "${username}" and set password. You can now log in.`);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    console.log(`Password updated for user "${username}". You can now log in.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
