import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nileshsri.freetalk",
  appName: "FreeTalk",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
