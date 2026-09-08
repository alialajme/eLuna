export type VerifyParams = {
  licenseNumber: string;
  companyName: string;
};

export type VerifyResult =
  // Registry confirmed the licence — `expiry` is the licence expiry if known.
  | { status: "verified"; expiry: Date | null; externalRef: string | null }
  // Submitted to the registry; confirmation is asynchronous.
  | { status: "pending"; externalRef: string | null }
  // Registry could not confirm the licence.
  | { status: "rejected"; reason: string };

export interface TradeLicenseVerifier {
  verify(params: VerifyParams): Promise<VerifyResult>;
}
