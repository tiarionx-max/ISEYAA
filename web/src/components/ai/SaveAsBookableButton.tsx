'use client';

import { useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { SaveAsBookableModal } from './SaveAsBookableModal';

export interface SaveAsBookableButtonProps {
  assistantMessage: string;
  aiConversationId?: string;
}

export function SaveAsBookableButton({
  assistantMessage,
  aiConversationId,
}: SaveAsBookableButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-xl bg-forest/15 border border-forest/25 text-forest-light text-xs font-semibold hover:bg-forest/25 hover:border-forest/40 transition-all"
        aria-label="Save this suggestion as a bookable tour"
      >
        <BookmarkPlus size={14} />
        Save as bookable tour
      </button>

      <SaveAsBookableModal
        open={open}
        onOpenChange={setOpen}
        assistantMessage={assistantMessage}
        aiConversationId={aiConversationId}
      />
    </>
  );
}
