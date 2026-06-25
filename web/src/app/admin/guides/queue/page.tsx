'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, MapPin, UserCheck, Shield } from 'lucide-react';
import { fetcher, api } from '@/lib/api';

const ALLOWED_ROLES = ['LGA_ADMIN', 'STATE_ADMIN', 'SUPER_ADMIN'];

interface TourGuide {
  id: string;
  user?: { firstName: string; lastName: string };
  lga?: { name: string };
  lgaId: string;
  yearsExperience?: number;
  languages?: string[];
  kycTier?: number;
  createdAt: string;
}

function RejectModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-jungle border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-3">Reject Guide</h2>
        <p className="text-white/50 text-sm mb-4">
          Provide a reason for rejection (will be shared with the applicant).
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. KYC documents could not be verified..."
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none placeholder:text-white/25 focus:outline-none focus:border-white/25"
        />
        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-white/50 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="min-h-[44px] px-5 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-700/40 text-red-300 font-bold text-sm rounded-xl disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * /admin/guides/queue — 09-10
 * Lists PENDING tour guide applications awaiting admin review (LGA_ADMIN+).
 */
export default function TourGuidesQueuePage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const qc = useQueryClient();

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/admin');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tour-guides-queue'],
    queryFn: () => fetcher('/admin/tour-guides/queue?limit=50'),
    enabled: status === 'authenticated',
  });

  const items: TourGuide[] = data?.items ?? data ?? [];

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/tour-guides/${id}/approve`, { decision: 'APPROVED' }),
    onSuccess: () => {
      toast.success('Guide approved');
      qc.invalidateQueries({ queryKey: ['admin-tour-guides-queue'] });
    },
    onError: () => toast.error('Failed to approve guide'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/tour-guides/${id}/approve`, { decision: 'REJECTED', reason }),
    onSuccess: () => {
      toast.success('Guide rejected');
      setRejectTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-tour-guides-queue'] });
    },
    onError: () => toast.error('Failed to reject guide'),
  });

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

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
          <div className="w-10 h-10 rounded-xl bg-forest/20 border border-forest/30 flex items-center justify-center">
            <UserCheck size={18} className="text-forest-light" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Tour Guide Queue</h1>
            <p className="text-white/35 text-xs">Guide applications awaiting review</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-900/15 border border-green-700/12 flex items-center justify-center mb-3">
              <CheckCircle size={22} className="text-green-500/40" />
            </div>
            <p className="text-white/35 font-semibold">No applications waiting for review</p>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-white/6 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_80px_1fr_80px_100px_160px] gap-3 px-5 py-3 border-b border-white/6 text-[10px] font-bold text-white/30 uppercase tracking-widest">
              <span>Name</span>
              <span>LGA</span>
              <span>Exp.</span>
              <span>Languages</span>
              <span>KYC Tier</span>
              <span>Submitted</span>
              <span className="text-right">Actions</span>
            </div>
            {items.map((guide) => {
              const name = guide.user
                ? `${guide.user.firstName} ${guide.user.lastName}`
                : guide.id.slice(0, 8) + '…';
              const langs = (guide.languages ?? []).join(', ') || '—';
              return (
                <div
                  key={guide.id}
                  className="grid grid-cols-[1fr_1fr_80px_1fr_80px_100px_160px] gap-3 items-center px-5 py-4 hover:bg-white/2 transition-colors border-b border-white/5 last:border-0"
                >
                  <p className="text-white font-semibold text-sm truncate">{name}</p>
                  <p className="text-white/55 text-sm flex items-center gap-1 truncate">
                    <MapPin size={11} className="text-white/25 shrink-0" />
                    {guide.lga?.name ?? guide.lgaId}
                  </p>
                  <p className="text-white/55 text-sm">
                    {guide.yearsExperience != null ? `${guide.yearsExperience}y` : '—'}
                  </p>
                  <p className="text-white/40 text-xs truncate">{langs}</p>
                  <p className="text-white/55 text-sm flex items-center gap-1">
                    <Shield size={11} className="text-white/25" />
                    {guide.kycTier ?? 0}
                  </p>
                  <p className="text-white/35 text-xs flex items-center gap-1">
                    <Clock size={10} className="text-white/20" />
                    {new Date(guide.createdAt).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => approveMutation.mutate(guide.id)}
                      disabled={isBusy}
                      className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 btn-primary text-white text-xs font-bold rounded-xl disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget(guide.id)}
                      disabled={isBusy}
                      className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 bg-red-900/25 hover:bg-red-900/40 border border-red-800/25 text-red-400 text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectModal
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectTarget, reason })}
          onCancel={() => setRejectTarget(null)}
          loading={rejectMutation.isPending}
        />
      )}
    </div>
  );
}
