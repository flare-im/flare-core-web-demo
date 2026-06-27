import path from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { createFlareCoreWebAppViteConfig } from "flare-core-typescript-sdk/devtools/vite";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typeScriptSdkRoot = path.resolve(__dirname, "../../packages/flare-core-typescript-sdk/src");

export default createFlareCoreWebAppViteConfig({
  appDir: __dirname,
  serverPort: 1430,
  defineConfig,
  loadEnv,
  vuePlugin: vue,
  extraAliases: [
    {
      find: "flare-core-typescript-sdk/transport",
      replacement: path.join(typeScriptSdkRoot, "adapters/_shared/transportProfile.ts"),
    },
  ],
});
