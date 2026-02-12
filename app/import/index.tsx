import { StyleSheet, View, Text } from 'react-native';

export default function ImportScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Import Photos</Text>
      <Text style={styles.subtitle}>Select photos to import as spots</Text>
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
