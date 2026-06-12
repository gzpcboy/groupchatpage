# Repository instructions

- Keep every tracked TypeScript file at **500 lines or fewer**.
- If a change would push a `.ts` file past that limit, split the module before adding more logic.
- Keep unit tests under `tests/unit/` and Playwright browser coverage under `e2e/`.
- Gate any live-model browser tests behind environment variables so default test runs stay deterministic.
- This app must remain **strictly browser-only** at runtime. Do **not** add any server-side service, API route, proxy, middleware, edge function, backend worker, token exchange endpoint, or same-origin passthrough.
- All runtime behavior must work from static assets plus browser-executed code only. If a feature requires a server-side hop, treat that approach as out of bounds and choose a browser-only design instead.

## Architecture map

- `src/main.ts` wires the UI, persisted settings, token onboarding, chat lifecycle, and markdown export.
- `src/group-chat.ts` orchestrates discussion rounds, summary generation, and the final judgment/synthesis/result pass.
- `src/group-chat-helpers.ts` owns prompt construction. Add new conversation modes and role behavior there first.
- `src/copilot.ts` is the only network layer for Copilot calls. Keep retries, fallbacks, and browser-only restrictions centralized there.
- `src/chat-preferences.ts` owns browser-side persistence for model selections, discussion mode, turns, sides, and per-model instructions.
- `src/conversation-export.ts` owns the downloadable Markdown export format.

## Safe extension points

- To add a new model, start in `src/config.ts`, then verify the UI still fits and the model works with the existing Copilot request builder.
- To add a new conversation mode, update:
  1. `src/types.ts`
  2. `src/chat-preferences.ts`
  3. `src/group-chat-helpers.ts`
  4. `src/main.ts`
  5. `src/conversation-export.ts`
- To add new per-model controls, store them in `chat-preferences.ts`, surface them in `main.ts`, and thread them into prompts through `group-chat-helpers.ts`.
- To change output formatting or downloads, keep the browser-only Blob download flow in `src/conversation-export.ts`.

## Persistence and UX rules

- Keep all user customizations in browser storage unless the user explicitly asks for stateless behavior.
- Do not introduce hidden server dependencies for auth, model routing, persistence, exports, or deployment.
- When a chat is running, changes in the docked setup panel should affect the **next** run unless the user explicitly starts over.

## Deployment and forks

- After `npm run build`, deployment should still be just static assets in `dist/`.
- Prefer feature flags, config constants, or small focused modules over large rewrites so forks can swap models, prompts, or UI sections independently.
- When adding a major feature, update this file with the new extension point so future contributors can find it quickly.
