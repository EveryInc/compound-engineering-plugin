import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

type PromoCarouselCardProps = {
  label?: string;
  onPress?: () => void;
  compact?: boolean;
};

export function PromoCarouselCard({ label = "Promo", onPress, compact = false }: PromoCarouselCardProps) {
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <Text style={styles.title}>{label}</Text>
      {onPress ? (
        <Pressable onPress={onPress} style={styles.button}>
          <Text style={styles.buttonText}>Open</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f4f4f5",
    marginBottom: 12,
  },
  compact: {
    padding: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#18181b",
  },
  button: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#2563eb",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "500",
  },
});

