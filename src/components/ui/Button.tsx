import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary: 'bg-primary hover:bg-primary-hover text-white shadow-subtle border border-transparent font-medium active:bg-[#3730A3]',
    secondary: 'bg-primary-light hover:bg-[#E0DEFF] text-primary border border-[#D5D3FF] font-medium',
    outline: 'bg-white hover:bg-[#F8FAFC] text-neutral-primary border border-neutral-border font-medium shadow-subtle',
    danger: 'bg-danger hover:bg-[#C94747] text-white shadow-subtle border border-transparent font-medium',
    ghost: 'bg-transparent hover:bg-[#F1F4F9] text-neutral-secondary hover:text-neutral-primary font-medium',
    success: 'bg-success hover:bg-[#0F8464] text-white shadow-subtle border border-transparent font-medium',
  };

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 rounded-md gap-1.5',
    md: 'text-sm px-3.5 py-2 rounded-lg gap-2',
    lg: 'text-base px-4 py-2.5 rounded-lg gap-2.5',
  };

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
