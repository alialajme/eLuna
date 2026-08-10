export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN" | "SUPPLIER";

export const ROLES = {
  CUSTOMER: "CUSTOMER" as UserRole,
  VENDOR: "VENDOR" as UserRole,
  ADMIN: "ADMIN" as UserRole,
  SUPPLIER: "SUPPLIER" as UserRole,
} as const;

export type ClerkSessionClaims = {
  metadata: {
    role?: UserRole;
    mfaEnabled?: boolean;
    vendorId?: string;
    supplierId?: string;
  };
};
