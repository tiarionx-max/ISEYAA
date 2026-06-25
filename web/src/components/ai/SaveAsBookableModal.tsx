'use client';

import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { X } from 'lucide-react';

/* ── Props ───────────────────────────────────────────────────────────────── */
export interface SaveAsBookableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantMessage: string;
  aiConversationId?: string;
}

/* ── Form shape ─────────────────────────────────────────────────────────── */
type FormValues = {
  title: string;
  description: string;
  suggestedItinerary: string;
};

const INPUT_CLS =
  'w-full bg-[rgba(0,0,0,0.45)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all placeholder-white/30 min-h-[44px]';
const TEXTAREA_CLS =
  'w-full bg-[rgba(0,0,0,0.45)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all placeholder-white/30 resize-none';

function firstLine(s: string) {
  return s.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80);
}

/* ── Component ───────────────────────────────────────────────────────────── */
export function SaveAsBookableModal({
  open,
  onOpenChange,
  assistantMessage,
  aiConversationId,
}: SaveAsBookableModalProps) {
  const router = useRouter();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title: firstLine(assistantMessage),
      description: assistantMessage.slice(0, 240),
      suggestedItinerary: assistantMessage,
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api
        .post('/tour-packages/from-ai-suggestion', {
          title: values.title,
          description: values.description,
          suggestedItinerary: values.suggestedItinerary,
          aiConversationId: aiConversationId ?? undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success('Saved to drafts', {
        action: { label: 'View drafts', onClick: () => router.push('/host') },
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        router.push('/login?returnTo=/ai');
        return;
      }
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Save failed. Please try again.');
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative bg-jungle-2 border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-[0_24px_64px_rgba(0,0,0,0.6)] max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 w-8 h-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors text-white/60 hover:text-white"
          aria-label="Close"
        >
          <X size={14} />
        </button>

        <h3 className="text-white font-bold text-lg mb-1">Save as bookable tour</h3>
        <p className="text-white/50 text-sm mb-5 leading-relaxed">
          We&apos;ve pre-filled from the AI suggestion. Edit before saving to your drafts.
        </p>

        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div>
            <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">
              Title
            </label>
            <input
              {...register('title', { required: 'Title is required', maxLength: 80 })}
              maxLength={80}
              className={INPUT_CLS}
            />
            {errors.title && (
              <p className="text-red-400 text-[11px] mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">
              Description (first 240 chars)
            </label>
            <textarea
              {...register('description')}
              rows={3}
              maxLength={240}
              className={TEXTAREA_CLS}
            />
          </div>

          <div>
            <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">
              Full AI itinerary
            </label>
            <textarea
              {...register('suggestedItinerary')}
              rows={6}
              className={TEXTAREA_CLS}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 min-h-[44px] py-2.5 bg-jungle-3 border border-white/10 text-white font-semibold rounded-xl text-sm hover:bg-jungle transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="flex-1 min-h-[44px] py-2.5 btn-gold text-jungle font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save to drafts'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
