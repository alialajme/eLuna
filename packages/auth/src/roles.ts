export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN";

export const ROLES = {
  CUSTOMER: "CUSTOMER" as UserRole,
  VENDOR: "VENDOR" as UserRole,
  ADMIN: "ADMIN" as UserRole,
} as const;

export type ClerkSessionClaims = {
  metadata: {
    role?: UserRole;
    mfaEnabled?: boolean;
    vendorId?: string;
  };
};
