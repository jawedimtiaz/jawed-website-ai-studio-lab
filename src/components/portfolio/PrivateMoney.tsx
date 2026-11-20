import React from 'react';
import { CurrencyCode } from '../../types/portfolio';

export function getPrivacyMask(currency: CurrencyCode | 'INR' | 'USD'): string {
  return currency === 'USD' ? '$ ••,•••' : '₹ ••,••,•••';
}

interface PrivateMoneyProps {
  value: string;
  currency: CurrencyCode | 'INR' | 'USD';
  privacyMode?: boolean;
  prefix?: string;
  className?: string;
}

/**
 * Displays a monetary figure normally, or masks it with a crisp blurred placeholder
 * (₹ ••,••,••• / $ ••,•••) when Privacy Blur Mode is enabled.
 */
export const PrivateMoney: React.FC<PrivateMoneyProps> = ({
  value,
  currency,
  privacyMode = false,
  prefix = '',
  className = ''
}) => {
  if (!privacyMode) {
    return (
      <span data-monetary="true" className={`monetary-value ${className}`.trim()}>
        {prefix ? `${prefix}${value}` : value}
      </span>
    );
  }

  return (
    <span
      data-monetary="true"
      data-privacy-masked="true"
      aria-label="Hidden monetary value"
      title="Privacy Blur active — click Privacy Blur in the dashboard control bar to reveal"
      className={`monetary-value privacy-blur inline-block select-none blur-[4px] opacity-85 tracking-wider transition-all duration-150 ${className}`.trim()}
    >
      {getPrivacyMask(currency)}
    </span>
  );
};
