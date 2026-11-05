import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: React.ReactNode;
  footer?: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}

export default function Card({
  children,
  className,
  padding = 'md',
  header,
  footer,
  title,
  subtitle,
  badge,
  action,
}: CardProps) {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      className={clsx(
        'bg-surface border border-neutral-border rounded-card shadow-subtle transition-all',
        className
      )}
    >
      {(header || title) && (
        <div className="px-5 py-4 border-b border-neutral-border flex items-center justify-between gap-4">
          {header ? (
            header
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-primary tracking-tight truncate">
                    {title}
                  </h3>
                  {badge}
                </div>
                {subtitle && (
                  <p className="text-xs text-neutral-secondary mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={paddingStyles[padding]}>{children}</div>

      {footer && (
        <div className="px-5 py-3.5 bg-[#FAFBFD] border-t border-neutral-border rounded-b-card">
          {footer}
        </div>
      )}
    </div>
  );
}
