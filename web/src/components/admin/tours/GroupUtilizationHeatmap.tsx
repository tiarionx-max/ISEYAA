'use client';

interface UtilizationBucket {
  date: string;
  groupSizeBucket: string;
  bookingCount: number;
  totalPassengers: number;
}

interface GroupUtilizationHeatmapProps {
  buckets: UtilizationBucket[];
  from: string;
  to: string;
}

// Fixed row order — all five buckets
const BUCKET_ROWS = ['1-2', '3-5', '6-9', '10-24', '25-50'];

/**
 * Generate an array of ISO date strings (YYYY-MM-DD) spanning [from, to].
 */
function generateDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Format a YYYY-MM-DD string to a short human-readable label (e.g. "Jun 1").
 */
function formatDateLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

/**
 * Compute a background opacity class based on count relative to max.
 * Returns a Tailwind bg-opacity-* or bg-transparent.
 */
function cellOpacity(count: number, max: number): string {
  if (max === 0 || count === 0) return 'bg-transparent';
  const ratio = count / max;
  if (ratio <= 0.1) return 'bg-gold/10';
  if (ratio <= 0.25) return 'bg-gold/20';
  if (ratio <= 0.4) return 'bg-gold/35';
  if (ratio <= 0.6) return 'bg-gold/50';
  if (ratio <= 0.8) return 'bg-gold/65';
  return 'bg-gold/85';
}

/**
 * GroupUtilizationHeatmap — 09-10.
 *
 * CSS Grid heatmap.  Rows = group-size buckets.  Columns = dates in [from, to].
 * Cell colour intensity based on bookingCount relative to the period maximum.
 */
export function GroupUtilizationHeatmap({
  buckets,
  from,
  to,
}: GroupUtilizationHeatmapProps) {
  const dates = generateDateRange(from, to);

  // Build lookup: date → bucket → { bookingCount, totalPassengers }
  const lookup = new Map<string, Map<string, { bookingCount: number; totalPassengers: number }>>();
  let maxCount = 0;

  for (const b of buckets) {
    if (!lookup.has(b.date)) lookup.set(b.date, new Map());
    lookup.get(b.date)!.set(b.groupSizeBucket, {
      bookingCount: b.bookingCount,
      totalPassengers: b.totalPassengers,
    });
    if (b.bookingCount > maxCount) maxCount = b.bookingCount;
  }

  // Show at most 31 columns to avoid overflow
  const visibleDates = dates.slice(0, 31);

  if (dates.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/30 text-sm">
        Invalid date range
      </div>
    );
  }

  const colCount = visibleDates.length;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `64px repeat(${colCount}, minmax(28px, 1fr))`,
          gap: '2px',
          minWidth: `${64 + colCount * 30}px`,
        }}
      >
        {/* Header row */}
        <div /> {/* empty top-left cell */}
        {visibleDates.map((d) => (
          <div
            key={d}
            className="text-center text-[9px] text-white/30 font-medium pb-1 leading-tight"
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: 42 }}
          >
            {formatDateLabel(d)}
          </div>
        ))}

        {/* Data rows */}
        {BUCKET_ROWS.map((bucket) => (
          <>
            <div
              key={`label-${bucket}`}
              className="text-[10px] text-white/45 font-semibold flex items-center justify-end pr-2 h-8"
            >
              {bucket}
            </div>
            {visibleDates.map((date) => {
              const cell = lookup.get(date)?.get(bucket);
              const count = cell?.bookingCount ?? 0;
              const passengers = cell?.totalPassengers ?? 0;
              return (
                <div
                  key={`${date}-${bucket}`}
                  title={`${date} · ${bucket}: ${count} booking${count !== 1 ? 's' : ''}, ${passengers} passenger${passengers !== 1 ? 's' : ''}`}
                  className={`h-8 rounded-sm border border-white/5 transition-colors ${cellOpacity(count, maxCount)}`}
                />
              );
            })}
          </>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 justify-end text-[10px] text-white/30">
        <span>Less</span>
        {['bg-transparent border border-white/8', 'bg-gold/10', 'bg-gold/35', 'bg-gold/65', 'bg-gold/85'].map((cls, i) => (
          <div key={i} className={`w-4 h-4 rounded-sm ${cls}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
