import { StyleSheet, Dimensions } from 'react-native';
import { theme } from './theme';

export const { width, height } = Dimensions.get('window');

export const commonStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingTop: 120, paddingHorizontal: 20, paddingBottom: 150 },
  card: { borderRadius: 24, overflow: 'hidden' },
  overline: { color: theme.colors.onPrimaryContainer, fontFamily: theme.fonts.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, marginBottom: 8, opacity: 0.8 },
  gridContainer: { marginTop: 20, gap: 16 },
  sectionContainer: { marginTop: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 22, fontFamily: theme.fonts.headline, fontWeight: '800', color: theme.colors.onSurface },
  transactionsList: { marginTop: 16, gap: 12 },
});
