/**
 * One-off backfill: convert any TON address stored in legacy raw form
 * (`0:hex`) into the canonical user-friendly form (`EQ…`/`UQ…`/`kQ…`/`0Q…`)
 * so it matches what the user sees in their wallet app.
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   cd backend && npx tsx scripts/normalizeTonAddresses.ts
 *   cd backend && npx tsx scripts/normalizeTonAddresses.ts --dry-run
 */
import prisma from '../src/config/database.js';
import { toFriendlyTonAddress } from '../src/services/tonService.js';

const isDryRun = process.argv.includes('--dry-run');

const main = async () => {
  const users = await prisma.user.findMany({
    where: { tonAddress: { not: null } },
    select: { id: true, username: true, tonAddress: true },
  });

  console.log(`Scanning ${users.length} user(s) with linked TON addresses…`);

  let updated = 0;
  let alreadyOk = 0;
  let unparseable = 0;
  const conflicts: { id: string; current: string; desired: string }[] = [];

  for (const u of users) {
    const current = u.tonAddress || '';
    const friendly = toFriendlyTonAddress(current);

    if (!friendly || friendly === current) {
      if (!friendly) {
        unparseable += 1;
        console.warn(`  [skip] unparseable for user ${u.id} (${u.username}): ${current}`);
      } else {
        alreadyOk += 1;
      }
      continue;
    }

    // Check whether the friendly form is already taken by another user
    // (e.g. someone signed in via friendly form before this backfill).
    const collision = await prisma.user.findUnique({ where: { tonAddress: friendly } });
    if (collision && collision.id !== u.id) {
      conflicts.push({ id: u.id, current, desired: friendly });
      console.warn(`  [conflict] user ${u.id} (${u.username}) wants ${friendly} but it's taken by ${collision.id}`);
      continue;
    }

    if (isDryRun) {
      console.log(`  [dry-run] would update ${u.id} (${u.username}): ${current} → ${friendly}`);
    } else {
      await prisma.user.update({
        where: { id: u.id },
        data: { tonAddress: friendly },
      });
      console.log(`  [updated] ${u.id} (${u.username}): ${current} → ${friendly}`);
    }
    updated += 1;
  }

  console.log('\nDone.');
  console.log(`  updated:        ${updated}${isDryRun ? ' (dry-run, no writes)' : ''}`);
  console.log(`  already ok:     ${alreadyOk}`);
  console.log(`  unparseable:    ${unparseable}`);
  console.log(`  conflicts:      ${conflicts.length}`);

  if (conflicts.length > 0) {
    console.log('\nConflicting records (resolve manually — likely duplicate accounts to merge):');
    for (const c of conflicts) {
      console.log(`  user ${c.id}: ${c.current}  →  ${c.desired} (already taken)`);
    }
  }
};

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
