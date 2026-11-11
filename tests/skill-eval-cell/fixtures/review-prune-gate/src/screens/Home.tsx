import React from "react";
import { ScrollView, Text } from "react-native";
import { NoteList } from "../widgets/NoteList";

export function Home() {
  return (
    <ScrollView>
      <Text>Your notes</Text>
      <NoteList />
    </ScrollView>
  );
}
