import Link from 'next/link';
import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ArrowRightIcon, ClockIcon, KeyIcon, TrophyIcon } from '@/components/ui/icons';

const steps = [
  { title: 'Create an account', body: 'Sign up with your email and pick a public username.' },
  { title: 'Get your CLI token', body: 'Generate it from your dashboard and copy it. It is shown once.' },
  { title: 'Code', body: 'Run the CLI in your terminal while you work.' },
  { title: 'Your coding time is reported', body: 'The CLI sends the time you just coded roughly every five minutes.' },
  { title: 'Compete on the leaderboard', body: 'Everyone is ranked by total coding time.' },
];

const highlights = [
  {
    icon: ClockIcon,
    title: 'Measured by the CLI',
    body: 'Your terminal tracks the time and reports the new seconds as you go. The server adds them to your running total.',
  },
  {
    icon: KeyIcon,
    title: 'A token you control',
    body: 'Rotate your CLI token whenever you like. The previous one stops working immediately.',
  },
  {
    icon: TrophyIcon,
    title: 'A public leaderboard',
    body: 'Rankings are based on cumulative coding time. Only usernames and totals are shown.',
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div className="hero-glow absolute inset-0 -z-10" aria-hidden="true" />
          <div className="bg-grid absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div className="animate-fade-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Command-line coding time, ranked
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]">
                Know exactly how long you <span className="text-accent">actually code</span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Coding Time Tracker measures your coding time from the command line, adds it up on the server, and ranks you on a
                public leaderboard.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/auth?mode=signup" size="lg">
                  Create an account
                  <ArrowRightIcon className="size-4" />
                </ButtonLink>
                <ButtonLink href="/auth?mode=login" variant="secondary" size="lg">
                  Sign in
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-subtle">
                Just curious? <Link href="/leaderboard" className="text-muted underline-offset-4 hover:text-fg hover:underline">
                  See the leaderboard
                </Link>.
              </p>
            </div>

            <div className="animate-fade-in [animation-delay:120ms]">
              <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/40">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <span className="size-2.5 rounded-full bg-[#3a4456]" aria-hidden="true" />
                  <span className="size-2.5 rounded-full bg-[#3a4456]" aria-hidden="true" />
                  <span className="size-2.5 rounded-full bg-[#3a4456]" aria-hidden="true" />
                  <span className="ml-2 font-mono text-xs text-subtle">terminal</span>
                </div>
                <pre aria-label="Example CLI commands" className="overflow-x-auto p-5 font-mono text-[13px] leading-7 text-muted sm:text-sm">
                  <span className="text-subtle"># one time: connect the CLI to your account{'\n'}</span>
                  <span className="text-accent">$ </span>
                  <span className="text-fg">ourcli config {'<YOUR-TOKEN>'}</span>
                  {'\n\n'}
                  <span className="text-subtle"># then, while you work{'\n'}</span>
                  <span className="text-accent">$ </span>
                  <span className="text-fg">ourcli watch</span>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section aria-labelledby="highlights-title" className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="highlights-title" className="sr-only">
              Highlights
            </h2>
            <ul className="grid gap-4 md:grid-cols-3">
              {highlights.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-xl border border-line bg-surface p-6">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 font-medium">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="border-t border-line bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 max-w-2xl text-muted">From sign-up to the leaderboard in five steps.</p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((step, i) => (
                <li key={step.title} className="relative rounded-xl border border-line bg-surface p-5">
                  <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 text-[15px] font-medium leading-snug">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to see your number?</h2>
              <p className="mt-2 text-muted">Create an account and get your CLI token in under a minute.</p>
            </div>
            <ButtonLink href="/auth?mode=signup" size="lg">
              Create an account
              <ArrowRightIcon className="size-4" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
