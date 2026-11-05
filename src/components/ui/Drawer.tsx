'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
  footer?: React.ReactNode;
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'lg',
  footer
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthStyles = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="fixed inset-0 bg-slate-950/30 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="fixed inset-y-0 right-0 flex pl-10">
        <div
          className={clsx(
            'w-screen bg-surface shadow-drawer border-l border-neutral-border flex flex-col',
            widthStyles[width]
          )}
        >
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-neutral-border flex items-center justify-between bg-white shrink-0">
            <div>
              <h2 className="text-base font-semibold text-neutral-primary tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-neutral-secondary mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-secondary hover:text-neutral-primary rounded-md hover:bg-[#F1F4F9] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#FAFBFC]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 bg-white border-t border-neutral-border shrink-0 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
