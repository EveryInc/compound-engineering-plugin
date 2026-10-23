import React from "react";
import { Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { formatDate } from "../src/utils/formatDate";

export default function HomeScreen() {
  const router = useRouter();
  return (
    <View>
      <Text>Trails updated {formatDate(new Date())}</Text>
      <Link href="/about">About</Link>
      <Pressable onPress={() => router.push("/legacy-settings")}>
        <Text>Settings</Text>
      </Pressable>
    </View>
  );
}
