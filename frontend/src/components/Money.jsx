import { formatNumber, symbolFor } from '../lib/currencies.js';
import { cn } from '../lib/cn.js';

// Consistent money display: symbol before the number, comma thousands, 2
// decimals, and the currency code in muted small text after.
// When `usdEquivalent` is provided for a non-USD amount, it's shown beneath in
// muted text so a raw USD conversion is never shown alone.
export default function Money({
  amount,
  code = 'USD',
  usdEquivalent = null,
  className,
  size = 'base',
}) {
  const sizeCls =
    size === 'lg' ? 'text-2xl font-semibold' : size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className={sizeCls}>
        {symbolFor(code)}
        {formatNumber(amount)}{' '}
        <span className="text-xs text-muted font-normal">{code}</span>
      </span>
      {code !== 'USD' && usdEquivalent != null && (
        <span className="text-xs text-muted">
          ≈ ${formatNumber(usdEquivalent)} USD
        </span>
      )}
    </span>
  );
}
