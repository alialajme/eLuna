import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Sym } from '@/components/ui/Sym';
import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCase, replyToCase, type CaseDetail } from '@/lib/cases';

type Message = CaseDetail['messages'][number];

const HANDLER_ROLES = new Set(['SUPPORT', 'CALL_CENTER', 'ADMIN', 'SYSTEM']);

export default function CaseThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const listRef = useRef<FlatList<Message>>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    getCase(id)
      .then((d) => {
        if (d) setDetail(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSend() {
    if (!reply.trim() || !id) return;
    setSending(true);
    const ok = await replyToCase(id, reply.trim()).catch(() => false);
    if (ok) {
      setReply('');
      load();
    }
    setSending(false);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Txt variant="bodyMd" color="textSecondary">
          Could not load this case.
        </Txt>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: c.fillSoft }]}>
          <Sym name="arrow-right" size={14} color={c.tint} style={{ transform: [{ scaleX: -1 }] }} />
          <Txt variant="label" color="tint">
            Back
          </Txt>
        </Pressable>
      </View>
    );
  }

  const isClosed = detail.status === 'RESOLVED' || detail.status === 'CLOSED' || detail.status === 'CANCELLED';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      {/* Header info */}
      <View style={[styles.header, { borderBottomColor: c.hairline, backgroundColor: c.surface }]}>
        <View style={{ flex: 1 }}>
          <Txt variant="bodySemiMd" color="text" numberOfLines={1}>
            {detail.subject}
          </Txt>
          <Txt variant="label" color="textSecondary" style={{ marginTop: 2 }}>
            {detail.caseNumber} · {detail.category}
          </Txt>
        </View>
        <View style={[styles.badge, { backgroundColor: c.fillSoft }]}>
          <Txt variant="label" color="tint">
            {detail.status.replace(/_/g, ' ')}
          </Txt>
        </View>
      </View>

      {/* Message thread */}
      <FlatList
        ref={listRef}
        data={detail.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center' }}>
              Your case has been received. We will reply shortly.
            </Txt>
          </View>
        }
        renderItem={({ item }) => {
          const isHandler = HANDLER_ROLES.has(item.authorRole);
          return (
            <View style={[styles.bubble, isHandler ? styles.bubbleHandler : styles.bubbleCustomer]}>
              <View
                style={[
                  styles.bubbleInner,
                  {
                    backgroundColor: isHandler ? c.fillSoft : c.surfaceInk,
                    borderRadius: Radii.card,
                  },
                ]}>
                <Txt variant="bodySm" color={isHandler ? 'text' : 'textOnInk'}>
                  {item.body}
                </Txt>
              </View>
              <Txt variant="label" color="textSecondary" style={styles.bubbleTime}>
                {isHandler ? item.authorRole : 'You'} ·{' '}
                {new Date(item.createdAt).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}
              </Txt>
            </View>
          );
        }}
      />

      {/* Reply composer */}
      {!isClosed && (
        <View style={[styles.composer, { borderTopColor: c.hairline, backgroundColor: c.surface }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="Add a reply…"
            placeholderTextColor={c.textSecondary}
            style={[styles.composerInput, { borderColor: c.hairline, backgroundColor: c.background, color: c.text }]}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !reply.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: c.surfaceInk, opacity: sending || !reply.trim() ? 0.4 : 1 },
            ]}>
            {sending ? (
              <ActivityIndicator color={c.textOnInk} size="small" />
            ) : (
              <Sym name="arrow-up" size={18} color={c.textOnInk} />
            )}
          </Pressable>
        </View>
      )}

      {isClosed && (
        <View style={[styles.closedBanner, { backgroundColor: c.fillSoft, borderTopColor: c.hairline }]}>
          <Txt variant="label" color="textSecondary" style={{ textAlign: 'center' }}>
            This case is {detail.status.toLowerCase().replace(/_/g, ' ')}
          </Txt>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radii.control },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radii.control },
  messages: { padding: Spacing.three, gap: Spacing.three },
  emptyThread: { paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
  bubble: { gap: 4 },
  bubbleHandler: { alignItems: 'flex-start' },
  bubbleCustomer: { alignItems: 'flex-end' },
  bubbleInner: { maxWidth: '80%', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleTime: { paddingHorizontal: Spacing.one },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.card,
  },
  closedBanner: {
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
