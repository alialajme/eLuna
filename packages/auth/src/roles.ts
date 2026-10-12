export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN" | "SUPPLIER" | "SUPPORT" | "CALL_CENTER";

export const ROLES = {
  CUSTOMER: "CUSTOMER",
  VENDOR: "VENDOR",
  ADMIN: "ADMIN",
  SUPPLIER: "SUPPLIER",
  SUPPORT: "SUPPORT",
  CALL_CENTER: "CALL_CENTER",
} as const satisfies Record<UserRole, UserRole>;

/** Roles permitted to operate the Case Manager console. */
export const CASE_HANDLER_ROLES: UserRole[] = ["ADMIN", "SUPPORT", "CALL_CENTER"];
export const isCaseHandler = (role: UserRole | null | undefined): boolean =>
  !!role && CASE_HANDLER_ROLES.includes(role);

export type ClerkSessionClaims = {
  metadata: {
    role?: UserRole;
    mfaEnabled?: boolean;
    vendorId?: string;
    supplierId?: string;
  };
};
