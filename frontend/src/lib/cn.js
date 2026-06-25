import clsx from 'clsx';

// Tiny className combiner. (clsx is enough here; no tailwind-merge needed yet.)
export function cn(...args) {
  return clsx(args);
}
