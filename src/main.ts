import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { sdkMediaProxyFields } from "@flare-im/vue-ui/app";
import { configureMediaProxy } from "@flare-im/vue-ui/utils";
import "@flare-im/vue-ui/app/style.css";

configureMediaProxy(sdkMediaProxyFields());

const app = createApp(App);
app.use(router);
app.mount("#app");
