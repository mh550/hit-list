import { StyleSheet, View, Text } from 'react-native';

export default function ImportReviewScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review Import</Text>
      <Text style={styles.subtitle}>Review grouped spots from imported photos</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
});
