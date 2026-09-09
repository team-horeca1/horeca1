import type { Prisma } from '@prisma/client';

/** Same customer definition as GET /api/v1/admin/users?role=customer. */
export function marketplaceCustomerFilter(): Prisma.UserWhereInput {
  return {
    OR: [
      { role: 'customer' },
      { accountMemberships: { some: { businessAccount: { isCustomer: true } } } },
    ],
  };
}
