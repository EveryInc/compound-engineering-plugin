import React, { useState } from "react";
import { Switch, Text, View } from "react-native";

export default function LegacySettingsScreen() {
  const [metric, setMetric] = useState(true);
  const [offline, setOffline] = useState(false);
  return (
    <View>
      <Text>Settings</Text>
      <View>
        <Text>Use metric units</Text>
        <Switch value={metric} onValueChange={setMetric} />
      </View>
      <View>
        <Text>Download maps for offline use</Text>
        <Switch value={offline} onValueChange={setOffline} />
      </View>
    </View>
  );
}
