// Admin account setup utility for Max Booster
// Run this script once to ensure the admin account has a lifetime subscription

import { users } from '../shared/schema.ts';
import { db } from '../server/db.ts';
import bcrypt from 'bcrypt';

async function setupAdminAccount() {
    const adminEmail = 'blawzmusic@gmail.com';
    const adminPassword = 'Iamadmin123!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Check if admin exists
    const existing = await db.query.users.findFirst({
        where: (u) => u.email === adminEmail,
    });

    if (existing) {
        // Update to lifetime subscription if not already
        await db.update(users)
            .set({
                role: 'admin',
                subscriptionTier: 'lifetime',
                subscriptionStatus: 'active',
                subscriptionEndsAt: new Date('2099-12-31'),
            })
            .where(users.id.eq(existing.id));
        console.log('Admin account updated to lifetime subscription.');
    } else {
        // Create admin with lifetime subscription
        await db.insert(users).values({
            email: adminEmail,
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            subscriptionTier: 'lifetime',
            subscriptionStatus: 'active',
            subscriptionEndsAt: new Date('2099-12-31'),
        });
        console.log('Admin account created with lifetime subscription.');
    }
}

setupAdminAccount().catch(console.error);
