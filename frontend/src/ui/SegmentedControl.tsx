import { useId } from 'react'
import { m } from 'motion/react'
import { t } from '../motion/variants'
import { cn } from './cn'

interface Option<T extends string> {
  value: T
  label: string
}

/** Radio-group semantics with a sliding selection indicator. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  label: string
  className?: string
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-sm border border-line bg-surface-1 p-0.5', className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative h-7 rounded-[3px] px-2.5 text-sm font-medium transition-colors',
              active ? 'text-text' : 'text-text-3 hover:text-text-2',
            )}
          >
            {active && (
              <m.span layoutId={`seg-${id}`} transition={t.base} className="absolute inset-0 rounded-[3px] bg-surface-2" />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
