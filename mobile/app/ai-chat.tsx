import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import EventSource from 'react-native-sse';
import { Send, Bot, MapPin, Calendar, Home, Car, Cloud, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SURFACE_DEEP, SURFACE_MID, SURFACE_RAISED,
  FOREST, FOREST_LIGHT, GOLD, GOLD_DIM, GOLD_LINE, CREAM,
  INK, INK_MID, INK_FAINT, BORDER, BORDER_MID,
  ERROR, SUCCESS,
  RADIUS_SM, RADIUS_MD, RADIUS_LG,
  FONT_DISPLAY, FONT_MONO,
} from '../lib/tokens';

import { API_BASE, refreshAccessToken } from '../lib/api';
const CHAT_STORAGE_KEY = 'ai_chat_history';
const MAX_STORED_MESSAGES = 100;

// ── Types ──────────────────────────────────────────────────────────────────────
type ToolCard = {
  name: 'get_attractions' | 'get_events' | 'get_stays' | 'get_ride_estimate' | 'get_weather';
  result: any;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  toolCards?: ToolCard[];
  isError?: boolean;
};


// Local message id only — never sent to a security-sensitive context, so Math.random()
// is fine here. Avoids the `uuid` package's crypto.getRandomValues() dependency, which
// Hermes doesn't provide without a native polyfill (react-native-get-random-values)
// that isn't linked into this build.
function uuidv4(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h > 12 ? h - 12 : h || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── ToolCardView ───────────────────────────────────────────────────────────────
function ToolCardView({ card }: { card: ToolCard }) {
  const ICON: Record<ToolCard['name'], any> = {
    get_attractions: MapPin,
    get_events: Calendar,
    get_stays: Home,
    get_ride_estimate: Car,
    get_weather: Cloud,
  };
  const Icon = ICON[card.name] ?? Bot;

  let label = '';
  let body = '';
  switch (card.name) {
    case 'get_attractions':
      label = `Found ${card.result?.count ?? 0} attractions`;
      body = card.result?.items?.map((i: any) => i.name).join(', ') ?? '';
      break;
    case 'get_events':
      label = `${card.result?.count ?? 0} upcoming events`;
      body = card.result?.items?.map((i: any) => i.title ?? i.name).join(', ') ?? '';
      break;
    case 'get_stays':
      label = `${card.result?.count ?? 0} properties found`;
      body = card.result?.items?.map((i: any) => i.name).join(', ') ?? '';
      break;
    case 'get_ride_estimate':
      label = `Ride estimate: ₦${card.result?.lowNgn ?? '—'} – ₦${card.result?.highNgn ?? '—'}`;
      body = card.result?.durationMin ? `~${card.result.durationMin} min` : '';
      break;
    case 'get_weather':
      label = `${card.result?.location ?? 'Unknown'}: ${card.result?.temperatureC ?? '—'}°C, ${card.result?.condition ?? ''}`;
      body = card.result?.humidity ? `Humidity: ${card.result.humidity}%` : '';
      break;
  }

  return (
    <View style={styles.toolCard}>
      <View style={styles.toolCardHeader}>
        <View style={styles.toolCardIconBox}>
          <Icon size={13} color={GOLD} />
        </View>
        <Text style={styles.toolLabel}>{label}</Text>
      </View>
      {!!body && <Text style={styles.toolBody}>{body}</Text>}
    </View>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const bubbleStyle = isUser ? styles.userBubble : styles.aiBubble;
  const containerStyle = isUser ? styles.userBubbleContainer : styles.aiBubbleContainer;
  const timestampStyle = isUser ? styles.timestampRight : styles.timestampLeft;

  return (
    <View style={containerStyle}>
      <View style={bubbleStyle} accessible={true} accessibilityRole="text" accessibilityLabel={message.content}>
        {message.isError ? (
          <Text style={styles.errorText}>{message.content}</Text>
        ) : (
          <Text style={isUser ? styles.userBubbleText : styles.bubbleText}>{message.content}</Text>
        )}
        {!isUser && message.toolCards && message.toolCards.length > 0 && (
          message.toolCards.map((card, idx) => (
            <ToolCardView key={`${card.name}-${idx}`} card={card} />
          ))
        )}
      </View>
      <Text style={[styles.timestamp, timestampStyle]}>{formatTime(message.timestamp)}</Text>
    </View>
  );
}

// ── TypingIndicator ────────────────────────────────────────────────────────────
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 200);
    const anim3 = animateDot(dot3, 400);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View
      style={styles.aiBubbleContainer}
      accessibilityLabel="Iṣẹ́yáá is typing"
      accessibilityRole="progressbar"
    >
      <View style={[styles.typingBubble]}>
        <View style={styles.dotsRow}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={[GOLD, FOREST_LIGHT]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.emptyIconBox}
      >
        <Sparkles size={28} color="#050E0E" />
      </LinearGradient>
      <Text style={styles.emptyHeading}>E kú aaro.</Text>
      <Text style={styles.emptySubheading}>Ask me anything about Ogun State</Text>
      <Text style={styles.emptyBody}>
        Plan trips, find events, book rides, check prices. Ask in any language.
      </Text>
    </View>
  );
}

// ── InputBar ───────────────────────────────────────────────────────────────────
function InputBar({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const canSend = value.trim().length > 0 && !disabled;
  return (
    <View style={styles.inputBar}>
      <TextInput
        style={styles.inputBox}
        value={value}
        onChangeText={onChange}
        placeholder="Ask anything, in any language…"
        placeholderTextColor={INK_MID}
        multiline
        editable={!disabled}
        returnKeyType="default"
      />
      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={onSend}
        disabled={!canSend}
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        <Send size={18} color={canSend ? '#050E0E' : INK_FAINT} />
      </TouchableOpacity>
    </View>
  );
}

// ── AiChatScreen (default export) ─────────────────────────────────────────────
export default function AiChatScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const consumedPromptRef = useRef(false);

  // Load persisted messages on mount; cleanup EventSource on unmount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setMessages(parsed);
        }
      } catch {
        // ignore corrupt storage
      }
    })();
    return () => {
      esRef.current?.close();
    };
  }, []);

  // Concierge quick-actions/suggested prompts navigate here with a `prompt` param
  // (e.g. router.push({ pathname: '/ai-chat', params: { prompt } })) — previously
  // this screen never read it, so the tapped prompt silently vanished and users
  // landed on an empty chat. Pre-fill the input (matches web's starter-prompt
  // behavior of populating the textbox rather than auto-sending).
  useEffect(() => {
    if (prompt && !consumedPromptRef.current) {
      consumedPromptRef.current = true;
      setInputText(Array.isArray(prompt) ? prompt[0] : prompt);
    }
  }, [prompt]);

  // Persist messages whenever they change (cap at MAX_STORED_MESSAGES)
  useEffect(() => {
    if (messages.length === 0) return;
    AsyncStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))
    ).catch(() => {});
  }, [messages]);

  // ── onChunk: append streamed token to last AI bubble ────────────────────────
  const onChunk = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [
        ...prev,
        { id: uuidv4(), role: 'assistant', content: text, streaming: true, timestamp: Date.now() },
      ];
    });
  }, []);

  // ── onToolCard: attach tool card to last AI bubble ───────────────────────────
  const onToolCard = useCallback((card: ToolCard) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        const updated: Message = {
          ...last,
          toolCards: [...(last.toolCards ?? []), card],
        };
        return [...prev.slice(0, -1), updated];
      }
      // No assistant message yet — create placeholder
      return [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          content: '',
          streaming: true,
          timestamp: Date.now(),
          toolCards: [card],
        },
      ];
    });
  }, []);

  // ── onDone: finalize streaming message ───────────────────────────────────────
  const onDone = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    setIsStreaming(false);
    esRef.current?.close();
    esRef.current = null;
  }, []);

  // ── handleError: show destructive bubble ─────────────────────────────────────
  const handleError = useCallback((reason: string) => {
    console.error('AI chat error:', reason);
    setMessages((prev) => [
      ...prev,
      {
        id: uuidv4(),
        role: 'assistant',
        content: 'Something went wrong. Check your connection and try again.',
        timestamp: Date.now(),
        isError: true,
      },
    ]);
    setIsStreaming(false);
    esRef.current?.close();
    esRef.current = null;
  }, []);

  // ── handleSend: build SSE request ────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isStreaming) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
    };

    // C-08: capture history BEFORE setMessages so payload uses the correct snapshot,
    // not a stale closure value that may not yet include prior state updates.
    const currentHistory = [...messages];

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');

    const payload = {
      messages: [...currentHistory, userMessage].map((m) => ({ role: m.role, content: m.content })),
    };

    setIsStreaming(true);

    // The SSE stream carries the access token in the Authorization header, read once
    // when the connection opens. A 15-minute-old token yields a 401 and the stream
    // errors out. `openStream` refreshes the token a single time and reopens before
    // falling back to the error UI — mirroring the axios interceptor's recovery.
    const openStream = async (isRetry: boolean): Promise<void> => {
      const token = await SecureStore.getItemAsync('access_token');

      const es = new EventSource(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      } as any);
      esRef.current = es;

      es.addEventListener('message', (event: any) => {
        if (event.data === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.error) {
            handleError(parsed.error);
            return;
          }
          if (parsed.text) {
            onChunk(parsed.text);
            return;
          }
          if (parsed.tool) {
            onToolCard({ name: parsed.tool, result: parsed.result });
            return;
          }
        } catch {
          // ignore malformed SSE data
        }
      });

      es.addEventListener('error', async (event: any) => {
        const status = event?.xhrStatus;
        // First failure — an auth 401/403 or an unknown connection drop: refresh the
        // token once and reopen. Give up (error UI) only if we've already retried or
        // the refresh itself fails.
        if (!isRetry && (status === 401 || status === 403 || !status)) {
          es.close();
          if (esRef.current === es) esRef.current = null;
          const newToken = await refreshAccessToken();
          if (newToken) {
            void openStream(true);
            return;
          }
        }
        handleError('connection');
      });
    };

    void openStream(false);
  }, [inputText, isStreaming, messages, onChunk, onDone, onToolCard, handleError]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            inverted
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
            ListHeaderComponent={isStreaming ? <TypingIndicator /> : null}
          />
        )}
        <InputBar
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          disabled={isStreaming}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },

  // AI bubble
  aiBubbleContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  } as any,
  aiBubble: {
    backgroundColor: SURFACE_MID,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: '82%',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    flexShrink: 0,
  },

  // User bubble
  userBubbleContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  userBubble: {
    backgroundColor: GOLD,
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: '78%',
    marginBottom: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  userBubbleText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#050E0E',
    fontWeight: '500',
  },

  bubbleText: {
    fontSize: 13,
    color: INK,
    lineHeight: 20,
  },

  errorText: {
    fontSize: 13,
    color: ERROR,
    lineHeight: 20,
  },

  // Timestamps
  timestamp: {
    fontSize: 10,
    color: INK_FAINT,
    marginBottom: 4,
    fontFamily: FONT_MONO,
  },
  timestampLeft: {
    marginLeft: 52,
    alignSelf: 'flex-start',
  },
  timestampRight: {
    marginRight: 16,
    alignSelf: 'flex-end',
  },

  // Tool card
  toolCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginTop: 10,
  },
  toolCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  toolCardIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GOLD,
    flex: 1,
  },
  toolBody: {
    fontSize: 12,
    color: INK_MID,
    lineHeight: 18,
  },

  // Typing indicator
  typingBubble: {
    backgroundColor: SURFACE_MID,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: 64,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    height: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: GOLD,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: SURFACE_RAISED,
    borderTopWidth: 1,
    borderTopColor: BORDER_MID,
    paddingHorizontal: 8,
    paddingVertical: 8,
    paddingLeft: 16,
    gap: 8,
  },
  inputBox: {
    flex: 1,
    fontSize: 13,
    color: INK,
    maxHeight: 100,
    backgroundColor: 'transparent',
    lineHeight: 20,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS_SM + 2,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyHeading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    fontWeight: '400',
    color: CREAM,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptySubheading: {
    fontSize: 15,
    fontWeight: '600',
    color: INK,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: INK_MID,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
});
