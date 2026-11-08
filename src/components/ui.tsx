import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'court' | 'outline' | 'ghost' | 'danger'
type Size = 'lg' | 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ball-400 text-court-900 hover:bg-ball-300 active:bg-ball-300 shadow-sm shadow-court-900/10',
  court: 'bg-court-700 text-white hover:bg-court-600 active:bg-court-800',
  outline: 'bg-white text-court-800 ring-1 ring-inset ring-court-200 hover:bg-court-50',
  ghost: 'bg-transparent text-court-800 hover:bg-court-100/60',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
}
const SIZES: Record<Size, string> = {
  lg: 'h-14 px-6 text-lg rounded-2xl',
  md: 'h-12 px-5 text-base rounded-xl',
  sm: 'h-10 px-3 text-sm rounded-lg',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

export function Button({
  variant = 'primary', size = 'md', loading, block, className = '', children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors
        focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-court-500
        disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]}
        ${block ? 'w-full' : ''} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-court-900/5 ${className}`}>{children}</section>
}

export function SectionLabel({ children, count, tone = 'default' }: { children: ReactNode; count?: number; tone?: 'default' | 'light' }) {
  return (
    <div className={`mb-3 flex items-center justify-between text-xs font-bold tracking-[0.14em] uppercase ${tone === 'light' ? 'text-court-100' : 'text-court-700'}`}>
      <h2>{children}</h2>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </div>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const s = size === 'lg' ? 'size-12' : 'size-8'
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className={s} />
      <span className={`font-black tracking-tight text-court-800 ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>
        Badinks
      </span>
    </span>
  )
}

export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-court-900">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm font-medium text-red-700">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-court-700/80">{hint}</span>
      ) : null}
    </label>
  )
}

export const inputClass =
  'block h-14 w-full rounded-2xl border-0 bg-court-50 px-4 text-lg text-ink ring-1 ring-inset ring-court-200 ' +
  'placeholder:text-court-700/45 focus:bg-white focus:ring-2 focus:ring-court-500 focus:outline-none'
