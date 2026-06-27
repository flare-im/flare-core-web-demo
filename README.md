# flare-core-web-app

Vue 3 + TypeScript + Naive UI production-shaped workbench for `flare-core-typescript-sdk` and **real** `flare-im-core-sdk` through browser WASM (`bindings/wasm` + `IMClient`).

Peer reference: `examples/flare-core-flutter-app` (interaction parity), `docs/client-api-reference.md`, `sdk-spec/shared/message_build_catalog.json`.

## Stack

- Vue 3 Composition API, Vue Router (hash), Vite, Naive UI
- **Shared UI**: `packages/flare-core-vue-im-ui`
- SDK entry: `createProductionAppClient` + `WebFlareImClient`
- Runtime: `platform=web`, `runtime=browser-wasm`
- Browser bridge: `WebProductionBridge` → `flare-im-core-sdk/bindings/wasm` with IndexedDB-backed SDK storage host

## Run (real server)

1. Start IM gateway (default `ws://127.0.0.1:60051/ws`, `http://127.0.0.1:50050`).
   Configure the browser app in `.env`. `VITE_FLARE_TOKEN_SECRET` must match
   the running gateway's local dev secret (`flare-im-core/logs/.dev-token-secret`)
   so WASM `sdk.generate_core_token` creates a token the server accepts.
2. Build the WASM package used by the browser production bridge:

```bash
cd flare-im-core-sdk
cargo xtask build wasm
```

3. Launch the browser workbench:

```bash
cd flare-im-core-client-sdk/examples/flare-core-web-app
npm install
npm run dev
```

Default Vite URL: `http://localhost:1430`

## Canonical layers (`examples/STRUCTURE.md`)

| Layer | Path |
|-------|------|
| host app | `src/main.ts`, `src/App.vue`, `src/router.ts`, and `src/views/*` own mounting, route views, guards, and media proxy config |
| shared UI | `flare-core-vue-im-ui/src/app/components/*` for reusable workbench components, SDK context helpers, and runtime adapter hooks |
| design system | `flare-core-vue-im-ui/src/design-system/*` for foundations, provider, theme, generated tokens |
| shared contracts | `flare-core-vue-im-ui/src/shared/*` for contracts, i18n, config, constants |

Workbench components use `useFlareCoreClient`; host route views should compose those components instead of duplicating init/login/sync orchestration.

## Build / checks

```bash
npm run dev:web
npm run typecheck
npm run build:web
npm run package:web
npm run test
```

`npm run build` and `npm run dev` are aliases for the web targets above.

## Dev media proxy (`.env.development`)

| Path | Target | Purpose |
|------|--------|---------|
| `/__flare-media-api` | `http://127.0.0.1:50050` | Gateway media API |
| `/__flare-storage` | `http://127.0.0.1:29000` | RustFS presigned PUT/GET |

Login **Media HTTP URL** defaults to `VITE_FLARE_HTTP_URL`.

## Routes

| Hash route | Screen |
|------------|--------|
| `#/login` | local `LoginView` wrapping `FlareLoginScreen` |
| `#/conversations` | local `ConversationsView` + `ChatPlaceholderView` |
| `#/chat` | local `ConversationsView` + `ChatView` |
| `#/sdk-lab` | local `SdkLabView` wrapping lazy SDK Lab component |

Router guard + `provideFlareSdk()` enforce auth gate.

## Feature coverage

| Area | Status |
|------|--------|
| Login/session lifecycle | Real via `WebFlareImClient.init/events.subscribeEvents/login`, event bridge for login_failed/token_expired/kicked_off/logged_out/reconnecting |
| Conversations | list/query/paginated/archived filters, pin/mute/archive/read/draft/delete/clear history |
| Chat | virtual MessageTimeline, EnhancedComposer, message actions, resend, typing, draft |
| Message types | text/image/video/audio/file/location/card/sticker/emoji/quote/link/forward/thread/rich/system/notification + Task/Schedule/Vote/Announcement/MiniProgram via `BusinessDetailBlock` |
| SDK Lab | message build catalog, dispatch, sync, presence, media, capability, events |
| Diagnostics | SDK version, FFI contract, data root, WASM status, connection/session snapshot |
| Theme | light/dark/system + compact/callDark/highContrast variants |
| i18n | zh-CN / en-US shared keys (`src/shared/i18n/messages.ts`) |

Browser mode does not provide local mock data. If WASM or the server is unavailable, login and SDK Lab operations surface typed SDK errors.

## Smoke path

1. Build WASM pkg (see above)
2. Start signaling access-gateway on `ws://127.0.0.1:60051`
3. `npm run dev` → Login → Conversations → open chat → send text → `#/sdk-lab` diagnostics
4. Toggle theme/language from workbench settings (when exposed) or localStorage keys `flare-web-theme-mode`, `flare-web-locale`

## Runtime gaps (honest)

- Some capability/call paths may return `capabilityUnavailable` until core plugin host is complete
- Next boundary pass: replace the remaining route-name assumptions inside optional workbench components with a navigation adapter when a host needs different route names.

## Legacy note

Do not treat old `browserClient` IndexedDB adapter as the long-term Web contract. This example uses WASM loader + TypeScript SDK web adapter boundary.
