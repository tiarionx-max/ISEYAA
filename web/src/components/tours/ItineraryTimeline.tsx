'use client';

import { MapPin } from 'lucide-react';

export interface ItineraryRow {
  hour: number;
  title: string;
  description: string;
  location?: string | null;
}

export function ItineraryTimeline({ items }: { items: ItineraryRow[] }) {
  if (!items || items.length === 0) return null;

  return (
    <ol className="relative border-l border-forest/30 space-y-0 ml-3">
      {items.map((item, i) => (
        <li key={i} className="relative pl-7 pb-8 last:pb-0">
          {/* Dot */}
          <span className="absolute -left-[9px] top-0 flex h-4.5 w-4.5 items-center justify-center">
            <span className="h-3.5 w-3.5 rounded-full bg-forest border-2 border-forest-light ring-4 ring-jungle block" />
          </span>

          {/* Time badge */}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-forest/15 border border-forest/25 text-forest-light text-[11px] font-bold mb-1.5">
            {item.hour === 0
              ? '12:00 AM'
              : item.hour < 12
              ? `${item.hour}:00 AM`
              : item.hour === 12
              ? '12:00 PM'
              : `${item.hour - 12}:00 PM`}
          </span>

          <h4 className="text-white font-bold text-sm leading-snug">{item.title}</h4>
          <p className="text-white/55 text-xs leading-relaxed mt-1">{item.description}</p>

          {item.location && (
            <p className="flex items-center gap-1 text-white/40 text-[11px] mt-1.5">
              <MapPin size={10} className="text-gold shrink-0" />
              {item.location}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
