import { Sym } from '@/components/ui/Sym';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listCases, type CaseSummary } from '@/lib/cases';

export default function SupportListScreen() {
  const c = useTheme();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setError(false);
      listCases()
        .then((data) => alive && setCases(data))
        .catch(() => alive && setError(true));
      return () => {
        alive = false;
      };
    }, []),
  );

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Txt variant="bodyMd" color="textSecondary">
          Could not load your cases.
        </Txt>
      </View>
    );
  }

  if (!cases) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {cases.length === 0 ? (
        <View style={[styles.center, { flex: 1 }]}>
          <View style={[styles.disc, { backgroundColor: c.fillSoft }]}>
            <Sym name="receipt" size={30} color={c.tint} />
          </View>
          <Txt variant="displaySm" color="text">
            No support cases
          </Txt>
          <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center', maxWidth: 260 }}>
            Have a question or issue? We are here to help.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.three }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/support/${item.id}`)}
              style={[styles.card, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <Txt variant="label" color="textSecondary">
                    {item.caseNumber}
                  </Txt>
                  <View style={[styles.badge, { backgroundColor: c.fillSoft }]}>
                    <Txt variant="label" color="tint">
                      {item.status.replace(/_/g, ' ')}
                    </Txt>
                  </View>
                </View>
                <Txt variant="bodyMedMd" color="text" numberOfLines={2} style={{ marginTop: Spacing.one }}>
                  {item.subject}
                </Txt>
                <Txt variant="bodySm" color="textSecondary" style={{ marginTop: Spacing.one }}>
                  {item.category}
                </Txt>
              </View>
              <Sym name="chevron-right" size={16} color={c.textSecondary} />
            </Pressable>
          )}
        />
      )}
      <Pressable
        onPress={() => router.push('/support/new')}
        style={[styles.fab, { backgroundColor: c.surfaceInk }]}>
        <Sym name="plus" size={20} color={c.textOnInk} />
        <Txt variant="bodySemiMd" color="textOnInk">
          New case
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  disc: { height: 72, width: 72, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radii.control },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radii.card,
  },
});
