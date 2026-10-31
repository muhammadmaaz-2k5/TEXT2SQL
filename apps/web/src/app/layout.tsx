import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AppProviders } from '@/components/providers';

export const metadata: Metadata = {
  title: 'DataPilot AI — Talk to your database',
  description:
    'Connect or provision a PostgreSQL database, ask questions in plain English, and get AST-validated SQL, results, charts, and explanations.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'DataPilot AI — Talk to your database',
    description:
      'Validated SQL, instant charts, and schema intelligence for modern data teams.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

