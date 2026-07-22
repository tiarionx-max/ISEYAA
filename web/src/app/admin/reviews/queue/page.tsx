'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Star, Flag, MessageCircle } from 'lucide-react';
import { fetcher, api } from '@/lib/api';

const ALLOWED_ROLES = ['LGA_ADMIN', 'STATE_ADMIN', 'SUPER_ADMIN'];

interface ReviewFlag {
  id: string;
  status: string;
  review?: {
    rating: number;
    comment?: string;
    targetType: string;
    targetId: string;
    user?: { firstName: string; lastName: string };
  };
  createdAt: string;
}

function ResolveModal({
  flagId,
  onConfirm,
  onCancel,
  loading,
}: {
  flagId: string;
  onConfirm: (decision: 'RESOLVED' | 'DISMISSED', resolution?: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [resolution, setResolution] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-jungle border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-2">Resolve Flag</h2>
        <p className="text-white/40 text-xs mb-4 font-mono">Flag ID: {flagId.slice(0, 16)}…</p>
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Resolution notes (optional)..."
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none placeholder:text-white/25 focus:outline-none focus:border-white/25 mb-4"
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-white/50 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm('DISMISSED')}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-bold text-sm rounded-xl disabled:opacity-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => onConfirm('RESOLVED', resolution)}
            disabled={loading}
            className="min-h-[44px] px-5 py-2 btn-primary text-white font-bold text-sm rounded-xl disabled:opacity-50"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * /admin/reviews/queue — 09-10
 * Lists open review flags awaiting admin resolution (LGA_ADMIN+).
 */
export default function ReviewsQueuePage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const qc = useQueryClient();

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/admin');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews-queue'],
    queryFn: () => fetcher('/admin/reviews/queue?status=OPEN&limit=50'),
    enabled: status === 'authenticated',
  });

  const items: ReviewFlag[] = data?.data ?? [];

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      resolution,
    }: {
      id: string;
      decision: 'RESOLVED' | 'DISMISSED';
      resolution?: string;
    }) =>
      api.post(`/admin/reviews/flags/${id}/resolve`, { decision, resolution }),
    onSuccess: () => {
      toast.success('Flag updated');
      setResolveTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-reviews-queue'] });
    },
    onError: () => toast.error('Failed to update flag'),
  });

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-forest rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jungle text-white">
      <div className="pt-16 max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-red-900/20 border border-red-700/25 flex items-center justify-center">
            <Flag size={18} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Review Flags Queue</h1>
            <p className="text-white/35 text-xs">Low-rated reviews requiring attention</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 skeleton rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-900/15 border border-green-700/12 flex items-center justify-center mb-3">
              <CheckCircle size={22} className="text-green-500/40" />
            </div>
            <p className="text-white/35 font-semibold">No flagged reviews to review</p>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-white/6 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_80px_1fr_160px] gap-4 px-5 py-3 border-b border-white/6 text-[10px] font-bold text-white/30 uppercase tracking-widest">
              <span>Target</span>
              <span>Reviewer</span>
              <span>Rating</span>
              <span>Comment</span>
              <span className="text-right">Actions</span>
            </div>
            {items.map((flag) => {
              const review = flag.review;
              const reviewerName = review?.user
                ? `${review.user.firstName} ${review.user.lastName}`
                : 'Unknown';
              const rating = review?.rating ?? 0;
              const isLow = rating <= 2;
              return (
                <div
                  key={flag.id}
                  className="grid grid-cols-[1fr_1fr_80px_1fr_160px] gap-4 items-center px-5 py-4 hover:bg-white/2 transition-colors border-b border-white/5 last:border-0"
                >
                  <div>
                    <p className="text-white/60 text-xs uppercase tracking-wide">
                      {review?.targetType ?? '—'}
                    </p>
                    <p className="text-white/35 text-[10px] font-mono truncate">
                      {review?.targetId?.slice(0, 12) ?? '—'}…
                    </p>
                  </div>
                  <p className="text-white/55 text-sm truncate">{reviewerName}</p>
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        className={
                          i < rating
                            ? isLow
                              ? 'text-red-400 fill-red-400'
                              : 'text-gold fill-gold'
                            : 'text-white/15'
                        }
                      />
                    ))}
                  </div>
                  <p className="text-white/40 text-xs truncate flex items-center gap-1">
                    {review?.comment ? (
                      <>
                        <MessageCircle size={10} className="text-white/20 shrink-0" />
                        {review.comment}
                      </>
                    ) : (
                      <span className="text-white/20 italic">No comment</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setResolveTarget(flag.id)}
                      disabled={resolveMutation.isPending}
                      className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 btn-primary text-white text-xs font-bold rounded-xl disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> Resolve
                    </button>
                    <button
                      onClick={() =>
                        resolveMutation.mutate({ id: flag.id, decision: 'DISMISSED' })
                      }
                      disabled={resolveMutation.isPending}
                      className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
                    >
                      <XCircle size={12} /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {resolveTarget && (
        <ResolveModal
          flagId={resolveTarget}
          onConfirm={(decision, resolution) =>
            resolveMutation.mutate({ id: resolveTarget, decision, resolution })
          }
          onCancel={() => setResolveTarget(null)}
          loading={resolveMutation.isPending}
        />
      )}
    </div>
  );
}
