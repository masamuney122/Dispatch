# Dispatch - Project Context for AI Assistants

This document is intended to provide a comprehensive overview of the **Dispatch** project to any AI coding assistant to help them understand the architecture, tech stack, and core features before contributing to the codebase.

## 🚀 Overview
Dispatch is a lightweight API client with one shared React codebase targeting both Tauri desktop and Chromium-based web/PWA builds. It allows developers to construct, send, and manage HTTP requests, organize them into collections, and use environment variables.

## 🛠️ Technology Stack
- **Application Frameworks**: [Tauri v2](https://v2.tauri.app/) for desktop and browser/PWA APIs for web
- **Frontend**: 
  - **React 19** (UI Library)
  - **TypeScript** (Type safety)
  - **Vite** (Build tool and dev server)
  - **Tailwind CSS 4.3** (Styling)
- **Backend / System Core**: 
  - **Rust 1.77+** (High-performance system logic)
  - **reqwest** (HTTP Client for executing requests)
  - **serde** & **serde_json** (Serialization/Deserialization)

## 📁 Project Architecture

The project has one shared React frontend and two platform implementations selected at build time.

### Frontend (`src/`)
- **`components/`**: Contains the React UI components.
  - `layout/`: Main application structure components (`ApiClientLayout.tsx`, `RequestTabsBar.tsx`, `BodyEditor.tsx`, `AuthEditor.tsx`, etc.).
  - `environment/`: Components for managing environment variables.
- **`hooks/`**: Custom React hooks.
  - `useRequestTabs.ts`: Manages the state of currently open request tabs.
  - `useAppData.ts`: Manages the global state for history, collections, and environments.
  - `useRequestExecution.ts`: Owns the request lifecycle (scripts, variable resolution, send, history).
  - `useResizablePanels.ts`: Owns pointer state and dimensions for the sidebar and response panel.
  - `useExplorerDragDrop.ts`: Owns collection-tree drag/drop, auto-scroll, and auto-expand behavior.
- **UI composition rule**: Layout components compose features; they must not accumulate transport,
  persistence, or complex pointer workflows. Prefer a focused hook for a stateful workflow, a child
  component for an independently rendered panel, and a utility for deterministic transformations.
  `RequestHistoryPanel.tsx` is the reference boundary for extracting a self-contained sidebar mode.
- **`services/`**: Platform-neutral facades imported by the shared UI.
- **`platform/desktop/services/`**: Tauri command, dialog, and window adapters.
- **`platform/web/`**: Browser fetch, File System Access API, IndexedDB, LocalStorage, and WASM adapters. Domain-specific WASM wrappers live under `services/core`; `wasmClient.ts` is only their stable barrel export.
- **`types/`**: TypeScript interfaces. **Crucial:** These types must always be kept in sync with the Rust models.

Build selection is handled by the Vite `@platform/*` alias. Shared components must not import Tauri or browser persistence APIs directly.

### Backend (`src-tauri/src/`)
- **`models/`**: Desktop-only runtime and response structures. Shared request/auth/workspace models live in `dispatch-core`.
- **`commands/`**: Tauri command handlers exposed to the frontend (e.g., `request_command.rs`, `history_command.rs`, `collection_command.rs`).
- **`services/`**: Desktop integrations such as `reqwest`, native cookies, filesystem persistence and archives. Shared rules belong in `dispatch-core`. Large native integrations are split into domain submodules: HTTP request building/response decoding, cookie record conversion, and archive format/reader/writer.
- **`commands/`**: Thin Tauri entry points. Workspace document persistence belongs to `workspace_document_service`; OAuth loopback/browser details live below `oauth_command`, not in the command flow itself.
- **`lib.rs` / `main.rs`**: Tauri application configuration, plugin registration, and command registration.

### Web Rust (`rust/`)

- `dispatch-core`: shared request/auth/settings/workspace models, immutable variable resolution, auth/body/settings transport preparation, response body classification, workspace creation/validation, collection/environment mutation rules, and typed OpenAPI parse/inspect/import/export logic. Native callers pass core models directly; JSON conversion is reserved for the JavaScript/WASM boundary.
- `dispatch-web-wasm`: the `wasm-bindgen` bridge loaded by the web adapter.

## ✨ Core Features & Implementation Details

1. **Request Construction & Execution**
   - The frontend constructs an `ApiRequest` object containing the URL, Method, Headers, Query Params, Body, and Auth configuration.
   - Before dispatching, `dispatch-core` resolves environment variables (e.g., `{{base_url}}`) in the request payload. Desktop reaches it through Tauri; web reaches the same function through WASM.
   - Authentication is applied to a cloned transport request by `dispatch-core`; `reqwest` and `fetch` remain platform adapters.
   - The shared execution hook invokes the selected platform service. Desktop translates the payload
     into a `reqwest::RequestBuilder` through Tauri; web translates the same prepared payload into
     browser `fetch`. Both return the same structured response contract to the UI.

2. **Authentication Handling**
   - The shared model lives in `rust/dispatch-core/src/auth.rs`; editing UI lives in `src/components/layout/AuthEditor.tsx`.
   - Supports: `None`, `Bearer Token`, `Basic Auth`, `API Key`, and `OAuth 2.0`.
   - OAuth 2.0 supports `Client Credentials`, `Password`, and `Authorization Code` flows.

3. **Environments & Variables**
   - Environments allow users to switch contexts (e.g., Local vs Production).
   - Desktop keeps active-environment state behind a `Mutex`; web persists the selection through its browser adapter.
   - Variables are injected into URLs, header names/values, bodies, form fields, and auth fields using double curly brace syntax.

4. **Collections & History**
   - **History**: Every executed request is automatically logged to a local history state.
   - **Collections**: Users can save specific requests into collections for future use.

## 🧑‍💻 Development Workflow
- **Running desktop**: `npm run tauri dev` starts the desktop-mode Vite server and Tauri window.
- **Running web**: `npm run dev:web` builds WASM and starts the web-mode Vite server.
- **Adding New Features**: 
  1. Define the data structure in both `src/types/` (TypeScript) and `src-tauri/src/models/` (Rust).
  2. Create or update a Tauri command in `src-tauri/src/commands/`.
  3. Register the new command in `src-tauri/src/lib.rs` under `tauri::generate_handler!`.
  4. Create a frontend service wrapper in `src/services/`.
  5. Implement the UI in `src/components/`.

## 🧪 Automated & Manual E2E Testing Strategy (Spring Boot Backend)

To ensure Dispatch works correctly and robustly, there is a **companion Spring Boot test backend** situated next to this project. This Spring Boot application serves as a dummy target server for end-to-end (E2E) testing of Dispatch's features.

**Critical Agent Instructions for Testing & Feature Development:**

1. **The Spring Boot Test Environment:** When asked to test a Dispatch feature (e.g., OAuth2, File Uploads, query parameters, complex headers), you must first ensure that the corresponding endpoints and configurations exist in the Spring Boot backend.
2. **Keep the Spring Backend Clean & Organized:** You are responsible for keeping the Spring test environment tidy. Do not dump all endpoints into one file. Create separate, logically grouped controllers (e.g., `AuthController`, `FileUploadController`, `MockDataController`) and modular configurations (e.g., `SecurityConfig`).
3. **End-to-End Testing Workflow:** 
   - **Step 1:** Implement or fix the mock endpoint in the Spring Boot project to simulate the specific scenario (e.g., a mock token issuer for OAuth2 or an endpoint that echoes headers).
   - **Step 2:** Start the Spring Boot application.
   - **Step 3:** Start Dispatch (`npm run tauri dev`).
   - **Step 4:** Use Dispatch to send requests to the local Spring Boot backend and verify that the React UI, Rust logic, and `reqwest` client handle the request/response cycle correctly.
4. **Synchronized Development:** When adding a new feature to Dispatch (e.g., a new Authentication type or a new Body format), you must simultaneously develop the corresponding test infrastructure in the Spring Boot project so that the new feature can be verified immediately.
