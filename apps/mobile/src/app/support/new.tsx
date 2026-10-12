import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { Txt } from '@/components/ui/Txt';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createCase, fetchCaseCategories, type CaseCategory } from '@/lib/cases';

const CASE_TYPES = ['COMPLAINT', 'SUGGESTION', 'QUESTION'] as const;
type CaseType = (typeof CASE_TYPES)[number];

const TYPE_LABELS: Record<CaseType, string> = {
  COMPLAINT: 'Complaint',
  SUGGESTION: 'Suggestion',
  QUESTION: 'Question',
};

export default function NewCaseScreen() {
  const c = useTheme();
  const [categories, setCategories] = useState<CaseCategory[]>([]);
  const [type, setType] = useState<CaseType>('QUESTION');
  const [categoryId, setCategoryId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCaseCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0 && cats[0]) setCategoryId(cats[0].id);
    });
  }, []);

  async function handleSubmit() {
    if (!subject.trim() || !description.trim() || !categoryId) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createCase({ type, categoryId, subject: subject.trim(), description: description.trim(), contactPhone: phone.trim() || undefined });
      if (!res) {
        setError('Failed to submit. Please try again.');
        return;
      }
      // Navigate back to the case thread
      router.replace(`/support/${res.id}`);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Type picker */}
        <Txt variant="label" color="textSecondary" style={styles.fieldLabel}>
          TYPE
        </Txt>
        <View style={styles.segmented}>
          {CASE_TYPES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[
                styles.segment,
                { borderColor: c.hairline, backgroundColor: type === t ? c.surfaceInk : c.surface },
              ]}>
              <Txt variant="label" color={type === t ? 'textOnInk' : 'textSecondary'}>
                {TYPE_LABELS[t]}
              </Txt>
            </Pressable>
          ))}
        </View>

        {/* Category picker */}
        {categories.length > 0 && (
          <>
            <Txt variant="label" color="textSecondary" style={styles.fieldLabel}>
              CATEGORY
            </Txt>
            <View style={styles.chips}>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={[
                    styles.chip,
                    { borderColor: c.hairline, backgroundColor: categoryId === cat.id ? c.tint : c.surface },
                  ]}>
                  <Txt variant="label" color={categoryId === cat.id ? 'textOnInk' : 'text'}>
                    {cat.name}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Subject */}
        <Txt variant="label" color="textSecondary" style={styles.fieldLabel}>
          SUBJECT
        </Txt>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of your issue"
          placeholderTextColor={c.textSecondary}
          style={[styles.input, { borderColor: c.hairline, backgroundColor: c.surface, color: c.text }]}
          maxLength={120}
        />

        {/* Description */}
        <Txt variant="label" color="textSecondary" style={styles.fieldLabel}>
          DESCRIPTION
        </Txt>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your issue in detail…"
          placeholderTextColor={c.textSecondary}
          style={[styles.textarea, { borderColor: c.hairline, backgroundColor: c.surface, color: c.text }]}
          multiline
          numberOfLines={5}
          maxLength={2000}
          textAlignVertical="top"
        />

        {/* Mobile number */}
        <Txt variant="label" color="textSecondary" style={styles.fieldLabel}>
          MOBILE NUMBER
        </Txt>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +971 50 123 4567"
          placeholderTextColor={c.textSecondary}
          style={[styles.input, { borderColor: c.hairline, backgroundColor: c.surface, color: c.text }]}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={20}
        />

        {error && (
          <Txt variant="bodySm" color="textSecondary" style={styles.error}>
            {error}
          </Txt>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submit, { backgroundColor: c.surfaceInk, opacity: submitting ? 0.5 : 1 }]}>
          {submitting ? (
            <ActivityIndicator color={c.textOnInk} />
          ) : (
            <Txt variant="bodySemiMd" color="textOnInk">
              Submit case
            </Txt>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: 0 },
  fieldLabel: { marginTop: Spacing.four, marginBottom: Spacing.one },
  segmented: { flexDirection: 'row', gap: Spacing.two },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
  },
  input: {
    height: 44,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
    fontSize: 15,
  },
  textarea: {
    minHeight: 120,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.control,
    fontSize: 15,
  },
  error: { marginTop: Spacing.two, color: '#a3312a' },
  submit: {
    marginTop: Spacing.five,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radii.card,
  },
});
