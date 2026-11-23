import { auth } from '@/lib/auth/server'

export default auth.middleware({
  loginUrl: '/masuk',
  publicRoutes: ['/masuk'],
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|xml|webmanifest)$).*)'],
}