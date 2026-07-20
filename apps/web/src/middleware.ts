import { clerkMiddleware } from '@clerk/nextjs/server';

// Phase 0: Clerk is wired but no routes are protected yet — the (app) group gains a
// route guard in Phase 4. Keeping middleware present now establishes the auth boundary.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
