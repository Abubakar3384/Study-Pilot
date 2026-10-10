import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { m } from 'motion/react'
import { press, t } from '../motion/variants'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-signal text-ink hover:bg-[#82cfe3] disabled:bg-line-strong disabled:text-text-3',
  secondary:
    'bg-surface-2 text-text border border-line-strong hover:border-text-3 disabled:text-text-3 disabled:hover:border-line-strong',
  ghost: 'text-text-2 hover:text-text hover:bg-surface-2 disabled:text-text-3 disabled:hover:bg-transparent',
  danger: 'text-incorrect border border-line-strong hover:tint-incorrect hover:border-incorrect',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-base gap-2',
  lg: 'h-11 px-5 text-md gap-2',
}

/** Square, unpadded boxes for icon-only buttons (padding would squeeze the icon). */
const iconSizes: Record<Size, string> = { sm: 'size-8', md: 'size-9', lg: 'size-11' }

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  /** Shows a busy state and blocks repeated clicks without changing the button's width. */
  busy?: boolean
  /** Square icon-only button; see IconButton. */
  iconOnly?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, busy, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <m.button
      ref={ref}
      type={type}
      whileTap={disabled || busy ? undefined : press}
      transition={t.micro}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-sm font-medium whitespace-nowrap transition-colors duration-150 [&_svg]:shrink-0',
        variant === 'primary' && '[&_kbd]:border-ink/30 [&_kbd]:text-ink/75',
        variants[variant],
        iconOnly ? iconSizes[size] : sizes[size],
        busy && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      {busy ? <BusyDots /> : icon}
      {iconOnly && busy ? null : children}
    </m.button>
  )
})

function BusyDots() {
  return (
    <span aria-hidden className="inline-flex w-4 justify-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 rounded-full bg-current opacity-40 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children'> {
  label: string
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = 'md', className, variant = 'ghost', ...rest },
  ref,
) {
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} iconOnly className={className} {...rest}>
      {children}
    </Button>
  )
})
