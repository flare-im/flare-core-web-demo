import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { sdkMediaProxyFields } from "flare-core-vue-im-ui/app";
import { configureMediaProxy } from "flare-core-vue-im-ui/utils";
import "flare-core-vue-im-ui/app/style.css";

configureMediaProxy(sdkMediaProxyFields());

const app = createApp(App);
app.use(router);
app.mount("#app");
