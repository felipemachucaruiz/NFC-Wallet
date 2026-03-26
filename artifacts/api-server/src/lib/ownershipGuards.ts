import { db, locationsTable, productsTable, userLocationAssignmentsTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

type MerchantScopedUser = { role: string; merchantId?: string | null };

export function isMerchantScoped(user: MerchantScopedUser): boolean {
  return user.role === "merchant_admin" || user.role === "merchant_staff";
}

export async function assertLocationAccess(
  locationId: string,
  user: MerchantScopedUser,
): Promise<{ location: typeof locationsTable.$inferSelect } | { error: string; status: 403 | 404 }> {
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId));

  if (!location) return { error: "Location not found", status: 404 };

  if (isMerchantScoped(user)) {
    if (!user.merchantId || location.merchantId !== user.merchantId) {
      return { error: "Access denied", status: 403 };
    }
    if (user.role === "merchant_staff") {
      const [{ totalAssignments }] = await db
        .select({ totalAssignments: count() })
        .from(userLocationAssignmentsTable)
        .where(eq(userLocationAssignmentsTable.userId, (user as AuthUser).id));

      if (totalAssignments > 0) {
        const [assignment] = await db
          .select()
          .from(userLocationAssignmentsTable)
          .where(
            and(
              eq(userLocationAssignmentsTable.locationId, locationId),
              eq(userLocationAssignmentsTable.userId, (user as AuthUser).id),
            ),
          );
        if (!assignment) return { error: "Not assigned to this location", status: 403 };
      }
    }
  }

  return { location };
}

export async function assertProductAccess(
  productId: string,
  user: MerchantScopedUser,
): Promise<{ product: typeof productsTable.$inferSelect } | { error: string; status: 403 | 404 }> {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product) return { error: "Product not found", status: 404 };

  if (isMerchantScoped(user)) {
    if (!user.merchantId || product.merchantId !== user.merchantId) {
      return { error: "Access denied", status: 403 };
    }
  }

  return { product };
}
