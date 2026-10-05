import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-muted">The page you are looking for doesn’t exist or has moved.</p>
        <ButtonLink href="/" variant="secondary" className="mt-8">
          Back to home
        </ButtonLink>
      </main>
      <Footer />
    </>
  );
}
