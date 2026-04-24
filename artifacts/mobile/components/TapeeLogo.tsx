import React from "react";
import { Image } from "react-native";

interface Props {
  width?: number;
  height?: number;
}

export function TapeeLogo({ width = 180, height = 67 }: Props) {
  return (
    <Image
      source={require("@/assets/images/tapee-logo.png")}
      style={{ width, height }}
      resizeMode="contain"
    />
  );
}
