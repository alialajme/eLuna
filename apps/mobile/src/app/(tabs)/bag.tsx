import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { BottomTabInset, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/api';
import { useBag, type BagLine } from '@/lib/bag';

export default function BagScreen() {
  const c = useTheme();
  const { lines, subtotal, count, setQty, remove } = useBag();

  if (lines.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <SafeAreaView edges={['top']} style={styles.head}>
          <Txt variant="displayLg" color="text">
            Bag
          </Txt>
        </SafeAreaView>
        <View style={styles.empty}>
          <View style={[styles.emptyDisc, { backgroundColor: c.fillSoft }]}>
            <Ionicons name="bag-outline" size={30} color={c.tint} />
          </View>
          <Txt variant="displaySm" color="text">
            Your bag is empty
          </Txt>
          <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center', maxWidth: 260 }}>
            Discover abayas from ateliers across the Gulf.
          </Txt>
          <Pressable onPress={() => router.push('/browse')} style={[styles.cta, { backgroundColor: c.surfaceInk }]}>
            <Txt variant="bodySemiMd" color="textOnInk">
              Start shopping
            </Txt>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaView edges={['top']} style={styles.head}>
        <Txt variant="displayLg" color="text">
          Bag
        </Txt>
        <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 2 }}>
          {count} {count === 1 ? 'item' : 'items'}
        </Txt>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: Spacing.three, paddingBottom: 200 }}>
        {lines.map((line) => (
          <BagRow key={line.key} line={line} onQty={(q) => setQty(line.key, q)} onRemove={() => remove(line.key)} />
        ))}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
        <View style={styles.subtotalRow}>
          <Txt variant="bodyMd" color="textSecondary">
            Subtotal
          </Txt>
          <Txt variant="displaySm" color="text">
            {formatPrice(subtotal)}
          </Txt>
        </View>
        <Pressable
          onPress={() => router.push('/checkout')}
          style={[styles.checkout, { backgroundColor: c.surfaceInk }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Checkout
          </Txt>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function BagRow({ line, onQty, onRemove }: { line: BagLine; onQty: (q: number) => void; onRemove: () => void }) {
  const c = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: c.hairline }]}>
      <Image
        source={line.image ? { uri: line.image } : undefined}
        style={[styles.thumb, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Txt variant="label" color="textSecondary" numberOfLines={1}>
          {line.vendor.toUpperCase()}
        </Txt>
        <Txt variant="bodyMedMd" color="text" numberOfLines={2} style={{ marginTop: 2 }}>
          {line.title}
        </Txt>
        <Txt variant="bodySm" color="textSecondary" style={{ marginTop: 2 }}>
          Size {line.size}
        </Txt>
        <View style={styles.rowBottom}>
          <View style={[styles.stepper, { borderColor: c.hairline }]}>
            <Pressable onPress={() => onQty(line.qty - 1)} hitSlop={6} style={styles.stepBtn}>
              <Ionicons name="remove" size={16} color={c.text} />
            </Pressable>
            <Txt variant="bodySemiMd" color="text" style={styles.qty}>
              {line.qty}
            </Txt>
            <Pressable onPress={() => onQty(line.qty + 1)} hitSlop={6} style={styles.stepBtn}>
              <Ionicons name="add" size={16} color={c.text} />
            </Pressable>
          </View>
          <Txt variant="price" color="text">
            {formatPrice(line.price * line.qty)}
          </Txt>
        </View>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.remove}>
        <Ionicons name="close" size={18} color={c.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  emptyDisc: { height: 72, width: 72, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: Spacing.two, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, borderRadius: Radii.card },
  row: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 78, height: 104, borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.control },
  stepBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  qty: { minWidth: 22, textAlign: 'center' },
  remove: { padding: Spacing.one },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subtotalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.three },
  checkout: { paddingVertical: Spacing.three + 2, borderRadius: Radii.card, alignItems: 'center' },
});
