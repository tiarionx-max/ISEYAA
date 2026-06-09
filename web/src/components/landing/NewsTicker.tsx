'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/api';
import { Radio } from 'lucide-react';

type NewsItem = {
  id: string;
  headline: string;
  summary?: string | null;
  source: string;
  link?: string | null;
  url?: string | null;
};

/* Static fallback so the strip never looks empty on cold start. */
const FALLBACK: NewsItem[] = [
  { id: 'f1', headline: 'Ogun State unveils Iṣẹ́yáá — Africa\'s most ambitious citizen super-platform.', source: 'Ogun State Govt' },
  { id: 'f2', headline: 'Tourism revenue doubles year-on-year as new attractions go live.',                 source: 'Iṣẹ́yáá Pulse' },
  { id: 'f3', headline: 'Vendor onboarding opens across all 20 LGAs — 0% fees for first 90 days.',          source: 'Marketplace' },
  { id: 'f4', headline: 'Eco-resort partnerships expand into Ogun Waterside and Ijebu.',                    source: 'Stays Desk' },
];

export function NewsTicker() {
  const { data } = useQuery<NewsItem[]>({
    queryKey: ['news-ticker'],
    queryFn: () => fetcher('/news?limit=20'),
    staleTime: 5 * 60 * 1000,
  });

  const items = (Array.isArray(data) && data.length > 0 ? data : FALLBACK).slice(0, 20);

  // Duplicate so the marquee loops seamlessly (translateX(-50%) returns to start)
  const looped = [...items, ...items];

  return (
    <section className="relative w-full bg-jungle-3 border-y border-white/8 overflow-hidden">
      <div className="relative h-10 flex items-stretch">
        {/* Left "LIVE" label (sticky over the marquee) */}
        <div className="relative z-10 flex items-center gap-2 px-4 bg-jungle-3 border-r border-white/8 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-70 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-400 text-[10px] font-black uppercase tracking-[0.18em]">LIVE</span>
          <span className="hidden sm:inline text-gold text-[10px] font-black uppercase tracking-[0.18em] border-l border-white/10 pl-3">
            <Radio size={10} className="inline mr-1 mb-0.5" />
            Iṣẹ́yáá Pulse
          </span>
        </div>

        {/* Marquee track */}
        <div className="relative flex-1 overflow-hidden">
          <div className="ticker-track absolute inset-y-0 left-0 flex items-center whitespace-nowrap">
            {looped.map((n, i) => {
              const href = n.link ?? n.url ?? null;
              const content = (
                <span className="inline-flex items-center gap-2.5 px-6 text-sm">
                  <span className="text-gold/85 font-bold uppercase text-[10px] tracking-wider">{n.source}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/85">{n.headline}</span>
                </span>
              );

              if (href) {
                return (
                  <a
                    key={`${n.id}-${i}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    {content}
                  </a>
                );
              }
              return (
                <span key={`${n.id}-${i}`}>
                  {content}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
