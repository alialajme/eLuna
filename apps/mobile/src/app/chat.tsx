import { Sym } from '@/components/ui/Sym';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendChat, type ChatMessage } from '@/lib/api';

const GREETING: ChatMessage = {
  role: 'assistant',
  content: "مرحباً! I'm your AYVANA stylist. Tell me the occasion and your size, and I'll find the abaya that fits.",
};

export default function ChatScreen() {
  const c = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    try {
      const reply = await sendChat(next.filter((m) => m !== GREETING));
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I couldn't respond just now." }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={96}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <View key={i} style={[styles.bubble, styles.user, { backgroundColor: c.surfaceInk }]}>
              <Txt variant="bodyMd" color="textOnInk">
                {m.content}
              </Txt>
            </View>
          ) : (
            <View key={i} style={[styles.bubble, styles.bot, { backgroundColor: c.surfaceAlt }]}>
              <Sym
                name="spark"
                size={13}
                color={c.tint}
                style={{ marginBottom: 4 }}
              />
              <Txt variant="bodyMd" color="text">
                {m.content}
              </Txt>
            </View>
          ),
        )}
        {sending && (
          <View style={[styles.bubble, styles.bot, { backgroundColor: c.surfaceAlt }]}>
            <ActivityIndicator color={c.tint} />
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask your stylist…"
            placeholderTextColor={c.textSecondary}
            style={[styles.input, { borderColor: c.hairline, color: c.text, backgroundColor: c.background }, Type.bodyMd]}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            disabled={!input.trim() || sending}
            style={[styles.send, { backgroundColor: c.surfaceInk }, (!input.trim() || sending) && { opacity: 0.4 }]}>
            <Sym name="arrow-up" size={20} color={c.textOnInk} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', padding: Spacing.three, borderRadius: Radii.card },
  user: { alignSelf: 'flex-end' },
  bot: { alignSelf: 'flex-start' },
  inputBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  send: { height: 40, width: 40, borderRadius: Radii.card, alignItems: 'center', justifyContent: 'center' },
});
