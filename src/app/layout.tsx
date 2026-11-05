import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'PromiseBack | Enterprise SLA Compensation & Recovery Platform',
  description: 'AI-powered contractual SLA compensation, downtime mapping, human approval workflows, and automated PayPal remedy disbursement.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background text-neutral-primary antialiased selection:bg-primary-light selection:text-primary">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
