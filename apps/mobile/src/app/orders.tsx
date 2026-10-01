import { Sym } from '@/components/ui/Sym';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchOrders, formatPrice, type OrderSummary } from '@/lib/api';

export default function OrdersScreen() {
  const c = useTheme();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchOrders()
      .then((o) => alive && setOrders(o))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Txt variant="bodyMd" color="textSecondary">
          Could not load your orders.
        </Txt>
      </View>
    );
  }
  if (!orders) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }
  if (orders.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <View style={[styles.disc, { backgroundColor: c.fillSoft }]}>
          <Sym name="receipt" size={30} color={c.tint} />
        </View>
        <Txt variant="displaySm" color="text">
          No orders yet
        </Txt>
        <Pressable onPress={() => router.push('/browse')} style={[styles.cta, { backgroundColor: c.surfaceInk }]}>
          <Txt variant="bodySemiMd" color="textOnInk">
            Start shopping
          </Txt>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: Spacing.three }}
      ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
      renderItem={({ item }) => (
        <View style={[styles.card, { borderColor: c.hairline, backgroundColor: c.surface }]}>
          <Image
            source={item.cover ? { uri: item.cover } : undefined}
            style={[styles.thumb, { backgroundColor: c.surfaceAlt }]}
            contentFit="cover"
          />
          <View style={{ flex: 1 }}>
            <View style={styles.cardTop}>
              <Txt variant="label" color="textSecondary">
                #{item.reference}
              </Txt>
              <View style={[styles.badge, { backgroundColor: c.fillSoft }]}>
                <Txt variant="label" color="tint">
                  {item.status}
                </Txt>
              </View>
            </View>
            <Txt variant="bodyMedMd" color="text" numberOfLines={1} style={{ marginTop: 2 }}>
              {item.title}
              {item.itemCount > 1 ? ` + ${item.itemCount - 1} more` : ''}
            </Txt>
            <Txt variant="price" color="text" style={{ marginTop: Spacing.one }}>
              {formatPrice(item.total)}
            </Txt>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  disc: { height: 72, width: 72, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: Spacing.two, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, borderRadius: Radii.card },
  card: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.card },
  thumb: { width: 64, height: 80, borderRadius: Radii.control },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radii.control },
});
