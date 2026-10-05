import Link from 'next/link';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#10151c" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#2f3b50" />
      <path d="m9 11 6 5-6 5" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17.5 21.5H23" stroke="#e7edf5" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} aria-label="Coding Time Tracker, home" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight text-fg">
      <LogoMark className="size-7" />
      <span className="hidden text-[15px] sm:inline">Coding Time Tracker</span>
    </Link>
  );
}
