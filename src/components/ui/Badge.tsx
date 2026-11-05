import React from 'react';
import clsx from 'clsx';

export type BadgeVariant = 
  | 'success' 
  | 'warning' 
  | 'danger' 
  | 'indigo' 
  | 'neutral' 
  | 'outline';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className
}: BadgeProps) {
  const variantStyles = {
    success: 'bg-[#E8F7F1] text-[#0D684F] border-[#C3EAD9]',
    warning: 'bg-[#FFF5E5] text-[#925B0E] border-[#FFE2B3]',
    danger: 'bg-[#FDECEC] text-[#9E2B2B] border-[#F9C9C9]',
    indigo: 'bg-[#EEEDFF] text-[#5146E5] border-[#D5D3FF]',
    neutral: 'bg-[#F1F4F9] text-[#475467] border-[#E2E8F0]',
    outline: 'bg-white text-[#475467] border-[#E8ECF2]',
  };

  const dotColors = {
    success: 'bg-[#139B76]',
    warning: 'bg-[#D99124]',
    danger: 'bg-[#DC5555]',
    indigo: 'bg-[#5146E5]',
    neutral: 'bg-[#64748B]',
    outline: 'bg-[#94A3B8]',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 leading-tight',
    md: 'text-xs px-2.5 py-1 leading-normal font-medium',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
