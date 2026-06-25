'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { SaveAsBookableButton } from '@/components/ai/SaveAsBookableButton';
import { Sparkles, Send, User, Bot, Loader2 } from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────────────── */
type Role = 'user' | 'assistant';
interface Message {
  role: Role;
  content: string;
  id: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ── Message bubble ─────────────────────────────────────────────────────── */
function MessageBubble({
  message,
  conversationId,
}: {
  message: Message;
  conversationId: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
          isUser
            ? 'bg-forest/20 border-forest/30'
            : 'bg-gold/10 border-gold/20'
        }`}
      >
        {isUser ? (
          <User size={14} className="text-forest-light" />
        ) : (
          <Bot size={14} className="text-gold" />
        )}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-forest/20 border border-forest/25 text-white'
              : 'bg-jungle-2 border border-white/8 text-white/85'
          }`}
        >
          {message.content}
        </div>

        {/* Save as bookable — only for assistant messages */}
        {!isUser && message.content && (
          <SaveAsBookableButton
            assistantMessage={message.content}
            aiConversationId={conversationId ?? undefined}
          />
        )}
      </div>
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function AiConciergePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auth gate
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?returnTo=/ai');
    }
  }, [status, router]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');

    const userMsg: Message = { role: 'user', content: text, id: uid() };
    const assistantId = uid();

    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    // Prepare history for API (role + content only, no id)
    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    try {
      const accessToken = (session as any)?.accessToken ?? '';

      abortRef.current = new AbortController();
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: history,
          conversationId: conversationId ?? undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.message ?? `HTTP ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      // Add empty assistant placeholder
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', id: assistantId },
      ]);

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // SSE lines
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              // Handle different SSE shapes
              const delta =
                parsed?.delta?.text ??
                parsed?.text ??
                parsed?.content ??
                '';
              if (delta) {
                accumulated += delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m,
                  ),
                );
              }
              if (parsed?.conversationId && !conversationId) {
                setConversationId(parsed.conversationId);
              }
            } catch {
              // Non-JSON line — skip
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: err?.message ?? 'Something went wrong. Please try again.',
              }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <Loader2 size={24} className="text-forest-light animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-jungle text-white flex flex-col">
      <Navbar />
      <PageTransition>
        <div className="flex flex-col flex-1 max-w-3xl mx-auto w-full px-4 pt-20 pb-6 h-screen">
          {/* ── Header ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0 mb-6"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                <Sparkles size={18} className="text-gold" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white">AI Concierge</h1>
                <p className="text-white/45 text-xs">
                  Powered by Claude · Ask anything about Ogun State tours &amp; attractions
                </p>
              </div>
            </div>
          </motion.div>

          {/* ── Messages ─────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1 scrollbar-thin">
            {messages.length === 0 && !streaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center pt-16"
              >
                <div className="w-16 h-16 rounded-3xl bg-forest/15 border border-forest/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} className="text-gold" />
                </div>
                <h2 className="text-white font-bold text-lg mb-2">
                  Where would you like to explore?
                </h2>
                <p className="text-white/45 text-sm max-w-md mx-auto leading-relaxed">
                  Ask me to plan a heritage tour, recommend local food experiences, find
                  guided packages, or build a full itinerary across Ogun State.
                </p>

                {/* Starter prompts */}
                <div className="flex flex-wrap gap-2.5 justify-center mt-8">
                  {[
                    'Plan a 2-day Abeokuta heritage trip',
                    'Best adire workshops in Ogun',
                    'Family-friendly tours near Sagamu',
                    'Corporate team outing ideas',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setInput(prompt);
                      }}
                      className="px-3.5 py-2 rounded-full bg-jungle-2 border border-white/10 text-white/70 text-xs hover:bg-jungle-3 hover:text-white hover:border-forest/30 transition-all min-h-[44px]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  conversationId={conversationId}
                />
              ))}
            </AnimatePresence>

            {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center border bg-gold/10 border-gold/20">
                  <Bot size={14} className="text-gold" />
                </div>
                <div className="bg-jungle-2 border border-white/8 rounded-2xl px-4 py-3">
                  <Loader2 size={14} className="text-gold animate-spin" />
                </div>
              </motion.div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* ── Input ─────────────────────────────────────────── */}
          <div className="shrink-0 mt-4">
            <div className="bg-jungle-2/95 border border-white/10 rounded-2xl flex items-end gap-3 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about tours, attractions, guides in Ogun State…"
                rows={2}
                disabled={streaming}
                className="flex-1 bg-transparent border-0 outline-none text-white text-sm placeholder-white/30 resize-none leading-relaxed py-1"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
                className="shrink-0 w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl btn-gold disabled:opacity-40 transition-all"
                aria-label="Send message"
              >
                {streaming ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
            <p className="text-[10px] text-white/25 text-center mt-2">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </PageTransition>
    </div>
  );
}
