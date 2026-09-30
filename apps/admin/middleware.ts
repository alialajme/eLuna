import { createAyvanaMiddleware } from "@ayvana/auth/middleware";

export default createAyvanaMiddleware("ADMIN");

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
