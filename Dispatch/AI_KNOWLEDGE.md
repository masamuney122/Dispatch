# Dispatch - Project Context for AI Assistants

This document is intended to provide a comprehensive overview of the **Dispatch** project to any AI coding assistant to help them understand the architecture, tech stack, and core features before contributing to the codebase.

## 🚀 Overview
Dispatch is a lightweight, cross-platform desktop API client. It is designed as a streamlined alternative to tools like Postman or Insomnia. It allows developers to construct, send, and manage HTTP requests, organize them into collections, and use environment variables.

## 🛠️ Technology Stack
- **Application Framework**: [Tauri v2](https://v2.tauri.app/) (Builds smaller, faster desktop apps)
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

The project is strictly divided into two parts: the React frontend (`src/`) and the Rust backend (`src-tauri/`).

### Frontend (`src/`)
- **`components/`**: Contains the React UI components.
  - `layout/`: Main application structure components (`ApiClientLayout.tsx`, `RequestTabsBar.tsx`, `BodyEditor.tsx`, `AuthEditor.tsx`, etc.).
  - `environment/`: Components for managing environment variables.
- **`hooks/`**: Custom React hooks.
  - `useRequestTabs.ts`: Manages the state of currently open request tabs.
  - `useAppData.ts`: Manages the global state for history, collections, and environments.
- **`services/`**: TypeScript wrappers that call Tauri backend commands using `@tauri-apps/api/core`.
- **`types/`**: TypeScript interfaces. **Crucial:** These types must always be kept in sync with the Rust models.

### Backend (`src-tauri/src/`)
- **`models/`**: Rust data structures that serialize/deserialize data to and from the frontend (e.g., `auth.rs`, `request.rs`, `response.rs`, `collection.rs`).
- **`commands/`**: Tauri command handlers exposed to the frontend (e.g., `request_command.rs`, `history_command.rs`, `collection_command.rs`).
- **`services/`**: Core business logic. This is where `reqwest` is utilized to actually send the HTTP requests.
- **`lib.rs` / `main.rs`**: Tauri application configuration, plugin registration, and command registration.

## ✨ Core Features & Implementation Details

1. **Request Construction & Execution**
   - The frontend constructs an `ApiRequest` object containing the URL, Method, Headers, Query Params, Body, and Auth configuration.
   - Before dispatching, the frontend resolves any environment variables (e.g., `{{base_url}}`) in the request payload.
   - It invokes the `send_request` Tauri command. The Rust backend takes this payload, translates it into a `reqwest::RequestBuilder`, executes the HTTP call, and returns a structured `Response` back to the UI.

2. **Authentication Handling**
   - Managed in `src-tauri/src/models/auth.rs` and `src/components/layout/AuthEditor.tsx`.
   - Supports: `None`, `Bearer Token`, `Basic Auth`, `API Key`, and `OAuth 2.0`.
   - OAuth 2.0 supports `Client Credentials`, `Password`, and `Authorization Code` flows.

3. **Environments & Variables**
   - Environments allow users to switch contexts (e.g., Local vs Production).
   - Rust manages a thread-safe `AppState` (wrapped in a `Mutex`) which is loaded upon application startup.
   - Variables are injected into URLs, Headers, and Bodies using double curly brace syntax.

4. **Collections & History**
   - **History**: Every executed request is automatically logged to a local history state.
   - **Collections**: Users can save specific requests into collections for future use.

## 🧑‍💻 Development Workflow
- **Running the App**: `npm run tauri dev` starts both the Vite dev server and the Rust Tauri window.
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
