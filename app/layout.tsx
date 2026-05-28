import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'TandemLog',
  description: 'Tandem Paragliding Flight Logger',
  applicationName: 'TandemLog',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TandemLog',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0EA5E9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${dmSans.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
