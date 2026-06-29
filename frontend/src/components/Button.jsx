import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn.js';

const VARIANTS = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary: 'bg-surface text-fg border border-border hover:bg-white/5',
  ghost: 'text-muted hover:bg-white/5 hover:text-fg',
  destructive: 'bg-danger text-white hover:bg-red-600',
};

// One button to rule them all:
//  - primary: indigo with a shimmer sweep on hover
//  - destructive: red, two-step confirm (click → "Are you sure?" → confirm
//    within 3s, else it resets)
//  - whileTap scale 0.96 + a one-shot "haptic" pulse on every click
//  - disabled: muted, not-allowed cursor, tooltip explaining why
export default function Button({
  variant = 'primary',
  children,
  onClick,
  disabled = false,
  disabledReason,
  loading = false,
  confirmLabel = 'Click again to confirm',
  type = 'button',
  className,
  ...rest
}) {
  const [armed, setArmed] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const armTimer = useRef(null);

  function pulse() {
    setPulsing(true);
    setTimeout(() => setPulsing(false), 400);
  }

  function handleClick(e) {
    if (disabled || loading) return;
    pulse();

    if (variant === 'destructive' && !armed) {
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
    onClick?.(e);
  }

  const isDisabled = disabled || loading;

  const button = (
    <motion.button
      type={type}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        'group relative overflow-hidden inline-flex items-center justify-center gap-2',
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors select-none',
        VARIANTS[variant],
        armed && 'ring-2 ring-red-300 bg-red-700',
        isDisabled && 'opacity-50 cursor-not-allowed',
        pulsing && 'btn-pulse',
        className
      )}
      {...rest}
    >
      {variant === 'primary' && !isDisabled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12
                     bg-white/25 group-hover:animate-[btn-shimmer_0.8s_ease]"
        />
      )}
      {loading && <Loader2 size={16} className="animate-spin" />}
      <span>{armed ? confirmLabel : children}</span>
    </motion.button>
  );

  if (isDisabled && disabledReason) {
    return (
      <Tooltip.Provider delayDuration={150}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="inline-block">{button}</span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              sideOffset={6}
              className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg"
            >
              {disabledReason}
              <Tooltip.Arrow className="fill-slate-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return button;
}
