import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/forgot-password(.*)',
  '/api/webhook(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const session = await auth()
  if (!session?.userId) {
    throw new Error('Unauthorized');
  }
})

export const config = {
  matcher: [
    // Match everything except static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
