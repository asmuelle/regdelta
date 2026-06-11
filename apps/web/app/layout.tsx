import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'RegDelta — Citation-Pinned Obligation Record',
  description:
    'Deterministic monitoring of government primary sources: every change card carries pinned source text, a content hash, and a verifiable audit trail. We detect and cite — you decide.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
