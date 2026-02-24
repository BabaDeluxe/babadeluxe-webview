export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'menu'

const textBase = 'text-sm'
const paddingPrimary = 'px-4 py-2.5'
const paddingGhostMenu = 'px-3 py-2'
const baseClasses = [
  'inline-flex items-center justify-center gap-2',
  'rounded-lg',
  'cursor-pointer',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const variantClassMap: Record<ButtonVariant, string> = {
  primary: [
    baseClasses,
    textBase,
    paddingPrimary,
    'font-onest font-medium',
    'bg-accentButton text-white',
    'transition-colors transition-transform duration-150',
    'hover:brightness-110 active:brightness-95',
  ].join(' '),

  secondary: [
    baseClasses,
    textBase,
    paddingPrimary,
    'font-onest font-medium',
    'bg-transparent border-2 border-accent text-accent',
    'transition-colors transition-transform duration-150',
    'hover:bg-accent/10 active:bg-accent/20',
  ].join(' '),

  ghost: [
    baseClasses,
    textBase,
    paddingGhostMenu,
    'font-onest font-medium',
    'text-subtleText',
    'transition-colors transition-transform duration-150',
    'hover:text-deepText hover:bg-borderMuted/20',
  ].join(' '),

  icon: [
    baseClasses,
    'w-7 h-7',
    'font-onest font-medium',
    'bg-transparent text-subtleText',
    'transition-colors transition-transform duration-150',
    'hover:text-deepText',
  ].join(' '),

  menu: [
    baseClasses,
    textBase,
    paddingGhostMenu,
    'font-onest font-medium',
    'bg-panel border border-borderMuted text-subtleText',
    'transition-colors transition-transform duration-150',
    'hover:bg-borderMuted hover:text-deepText',
  ].join(' '),
}

export function useButtonVariants() {
  const getButtonClasses = (variant: ButtonVariant) => variantClassMap[variant]
  return { getButtonClasses }
}
