import { createLunaMiddleware } from "@e-luna/auth/middleware";

export default createLunaMiddleware("VENDOR");

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
