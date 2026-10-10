/** StudyPilot mark: a page whose ruled lines resolve into three linked points. */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M5 2.75h9.5L19 7.25V21.25H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14.5 2.75v4.5H19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 16.5 12 11.5l3.5 3" stroke="var(--color-signal)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.5" cy="16.5" r="1.6" fill="var(--color-signal)" />
      <circle cx="12" cy="11.5" r="1.6" fill="var(--color-amber)" />
      <circle cx="15.5" cy="14.5" r="1.6" fill="var(--color-signal)" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-text">
      <LogoMark />
      <span className="text-md font-semibold tracking-[-0.01em]">StudyPilot</span>
    </span>
  )
}
