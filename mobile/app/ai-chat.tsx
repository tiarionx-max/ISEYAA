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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';
import EventSource from 'react-native-sse';
import { Send, Bot, MapPin, Calendar, Home, Car, Cloud } from 'lucide-react-native';

// ── Constants ──────────────────────────────────────────────────────────────────
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
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
        <Icon size={14} color={GOLD} />
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
          <Text style={styles.bubbleText}>{message.content}</Text>
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
      accessibilityLabel="ISEYAA is typing"
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
      <Bot size={48} color={GOLD} style={{ marginBottom: 16 }} />
      <Text style={styles.emptyHeading}>Ask me anything about Ogun State</Text>
      <Text style={styles.emptyBody}>
        Discover attractions, events, stays, and more. I can check prices, find rides, and plan your trip.
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
        placeholder="Ask about Ogun State..."
        placeholderTextColor="rgba(255,255,255,0.3)"
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
        <Send
          size={20}
          color={canSend ? JUNGLE : 'rgba(28,43,43,0.5)'}
        />
      </TouchableOpacity>
    </View>
  );
}

// ── AiChatScreen (default export) ─────────────────────────────────────────────
export default function AiChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const flatListRef = useRef<FlatList>(null);

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
  const handleError = useCallback((_reason: string) => {
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

    const token = await SecureStore.getItemAsync('access_token');

    const payload = {
      messages: [...currentHistory, userMessage].map((m) => ({ role: m.role, content: m.content })),
    };

    setIsStreaming(true);

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

    es.addEventListener('error', () => {
      handleError('connection');
    });
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
    backgroundColor: JUNGLE,
  },

  // AI bubble
  aiBubbleContainer: {
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  aiBubble: {
    backgroundColor: 'rgba(26,107,60,0.25)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '80%',
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 8,
  },

  // User bubble
  userBubbleContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  userBubble: {
    backgroundColor: 'rgba(200,150,42,0.15)',
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '80%',
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.3)',
  },

  bubbleText: {
    fontSize: 14,
    color: 'white',
    lineHeight: 21,
  },

  errorText: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 21,
  },

  // Timestamps
  timestamp: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 4,
  },
  timestampLeft: {
    marginLeft: 20,
    alignSelf: 'flex-start',
  },
  timestampRight: {
    marginRight: 20,
    alignSelf: 'flex-end',
  },

  // Tool card
  toolCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    marginTop: 8,
  },
  toolCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  toolLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: GOLD,
    flex: 1,
  },
  toolBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },

  // Typing indicator
  typingBubble: {
    backgroundColor: 'rgba(26,107,60,0.25)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: 64,
    marginLeft: 16,
    marginBottom: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  inputBox: {
    flex: 1,
    fontSize: 14,
    color: 'white' as const,
    maxHeight: 100,
    backgroundColor: 'transparent',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(200,150,42,0.3)',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyHeading: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 21,
  },
});
