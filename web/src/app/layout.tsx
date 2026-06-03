import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Iṣẹ́yáá — Ogun State Digital Super-Platform',
  description: 'Everything Ogun State. One platform for 7 million citizens across all 20 LGAs.',
  keywords: 'Ogun State, tourism, events, stays, marketplace, studio, wallet, Nigeria, government, LGA',
  openGraph: {
    title: 'Iṣẹ́yáá — Ogun State Digital Super-Platform',
    description: 'Everything Ogun State. One platform for 7 million citizens.',
    locale: 'en_NG',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
