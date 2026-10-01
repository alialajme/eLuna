import { Sym } from '@/components/ui/Sym';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/ProductCard';
import { Txt } from '@/components/ui/Txt';
import { Wordmark } from '@/components/Wordmark';
import { BottomTabInset, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/hooks/use-catalog';
import type { Category, ProductListItem } from '@/lib/api';

export default function HomeScreen() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const { data, loading, error, reload } = useCatalog();

  const heroH = Math.min(Math.round(width * 1.12), 560);
  const railCardW = width < 500 ? 168 : 210;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Wordmark />
        <Pressable hitSlop={10} onPress={() => router.push('/browse')}>
          <Sym name="search" size={22} color={c.text} />
        </Pressable>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Txt variant="bodyMd" color="textSecondary" style={{ textAlign: 'center' }}>
            {error ?? 'Something went wrong.'}
          </Txt>
          <Pressable onPress={reload} style={[styles.retry, { borderColor: c.text }]}>
            <Txt variant="bodySemiMd" color="text">
              Try again
            </Txt>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.five }}>
          {/* Hero */}
          <Pressable onPress={() => router.push('/browse')} style={{ height: heroH }}>
            <Image
              source={data.products[0]?.image ? { uri: data.products[0].image } : undefined}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
            <LinearGradient
              colors={['rgba(18,18,18,0.05)', 'rgba(18,18,18,0.35)', 'rgba(18,18,18,0.78)']}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroContent}>
              <Txt variant="displayXl" color="textOnInk" style={styles.heroTitle}>
                The season&rsquo;s abayas, curated.
              </Txt>
              <Txt variant="bodyLg" color="textOnInk" style={styles.heroSub}>
                From ateliers across the Gulf — styled to your measurements.
              </Txt>
              <View style={[styles.heroBtn, { backgroundColor: c.background }]}>
                <Txt variant="bodySemiMd" color="text">
                  Explore the edit
                </Txt>
                <Sym name="arrow-right" size={16} color={c.text} />
              </View>
            </View>
          </Pressable>

          {/* Categories */}
          <View style={styles.section}>
            <Txt variant="displayMd" color="text" style={styles.sectionTitle}>
              Shop by occasion
            </Txt>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.categories}
            keyExtractor={(cat) => cat.slug}
            contentContainerStyle={styles.railPad}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.two }} />}
            renderItem={({ item }) => <CategoryTile category={item} />}
          />

          {/* Featured rail */}
          <SectionHeader title="Featured" onAction={() => router.push('/browse')} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.products.slice(0, 8)}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.railPad}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.three }} />}
            renderItem={({ item }: { item: ProductListItem }) => (
              <ProductCard item={item} width={railCardW} />
            )}
          />

          {/* Atelier / stylist band */}
          <Pressable
            onPress={() => router.push('/chat')}
            style={[styles.band, { backgroundColor: c.surfaceInk }]}>
            <Sym name="spark" size={20} color={c.fill} />
            <Txt variant="displaySm" color="textOnInk" style={styles.bandTitle}>
              Your AYVANA stylist
            </Txt>
            <Txt variant="bodyMd" color="textOnInk" style={styles.bandBody}>
              Tell us the occasion and your size profile. We&rsquo;ll find the abaya that fits.
            </Txt>
            <View style={styles.bandLink}>
              <Txt variant="bodySemiMd" color="fill">
                Find your fit
              </Txt>
              <Sym name="arrow-right" size={15} color={c.fill} />
            </View>
          </Pressable>

          {/* New arrivals rail */}
          <SectionHeader title="New arrivals" onAction={() => router.push('/browse')} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.products.slice(8, 14)}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.railPad}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.three }} />}
            renderItem={({ item }: { item: ProductListItem }) => (
              <ProductCard item={item} width={railCardW} />
            )}
          />
        </ScrollView>
      )}
    </View>
  );
}

function SectionHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <View style={[styles.section, styles.sectionRow]}>
      <Txt variant="displayMd" color="text" style={styles.sectionTitle}>
        {title}
      </Txt>
      {onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Txt variant="bodySemiMd" color="tint">
            See all
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

function CategoryTile({ category }: { category: Category }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/browse', params: { category: category.slug } })}
      style={[styles.catTile, { backgroundColor: c.fillSoft, borderColor: c.hairline }]}>
      <Txt variant="displaySm" color="text" style={{ textTransform: 'capitalize' }}>
        {category.name}
      </Txt>
      <View style={styles.catArrow}>
        <Sym name="arrow-right" size={15} color={c.tint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  retry: { borderWidth: 1, borderRadius: Radii.card, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  heroContent: { flex: 1, justifyContent: 'flex-end', padding: Spacing.four, gap: Spacing.two },
  heroTitle: { maxWidth: 320 },
  heroSub: { maxWidth: 320, opacity: 0.92 },
  heroBtn: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radii.card,
  },
  section: { paddingHorizontal: Spacing.three, paddingTop: Spacing.five, paddingBottom: Spacing.three },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {},
  railPad: { paddingHorizontal: Spacing.three },
  catTile: {
    width: 168,
    height: 96,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  catArrow: { alignSelf: 'flex-end' },
  band: {
    marginTop: Spacing.five,
    marginHorizontal: Spacing.three,
    borderRadius: Radii.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  bandTitle: { marginTop: Spacing.two },
  bandBody: { maxWidth: 300, opacity: 0.9 },
  bandLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
});
