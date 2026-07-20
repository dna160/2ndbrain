import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ClerkProvider } from '@clerk/nextjs';

import './globals.css';

export const metadata: Metadata = {
  title: 'Recall',
  description: 'A WhatsApp-native second brain.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
