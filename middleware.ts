import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/forgot-password(.*)',
  '/api/webhook(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Allow all public routes
  if (isPublicRoute(req)) return

  // For all other routes, check authentication
  const session = await auth()
  if (!session?.userId) {
    // Redirect to sign-in instead of throwing error
    const signInUrl = new URL('/sign-in', req.url)
    return Response.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    // Match everything except static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}