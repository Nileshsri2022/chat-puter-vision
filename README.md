<div align="center">

# FreeTalk

### One workspace. Multiple AI models.

A responsive AI chat app for text, images, and voice — powered by Puter, with no provider API keys to configure.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-7-119EFF?logo=capacitor&logoColor=white)

[Getting started](#getting-started) · [Features](#features) · [Development](#development) · [Contributing](#contributing)

</div>

---

## Overview

FreeTalk brings multiple AI providers into a single conversation interface. Choose a model, stream a response, work with image attachments, or dictate a draft. Conversations are cached in your browser, with cloud synchronization through Puter when signed in.

Built with React and TypeScript, the app supports light and dark themes, a docked desktop sidebar, a mobile overlay, and an Android wrapper using Capacitor.

> **No API keys does not mean unlimited free usage.** AI features require a Puter account and an internet connection. Requests use the signed-in account's allowance or credits; model availability and pricing are managed by Puter.

<!-- Add the supplied desktop screenshot here once its attachment is available:
![FreeTalk in dark mode showing a Goa travel conversation, sidebar, and multimodal composer](docs/screenshots/freetalk-desktop.png)
-->

## Features

| Area | What you can do |
| --- | --- |
| **Multi-model chat** | Browse models grouped by provider, search the picker, and filter by capability categories. |
| **Streaming responses** | Read responses as they arrive, stop generation, regenerate replies, and edit user messages to resend them. |
| **Rich messages** | Render Markdown, tables, fenced code blocks, and generated images; copy messages or individual code blocks. |
| **Conversation organization** | Search titles and message content, rename and pin chats, and delete individual or multiple conversations. |
| **Find in chat** | Search the active transcript with highlighted matches, a match counter, and previous/next navigation. |
| **Artifacts panel** | Open the panel on the right for everything the conversation produced: images (attached and generated), code blocks and tables from assistant answers. Filter by kind. Click an entry to jump to its message, or to the exact code block or table, which flashes. Preview, copy, or download any of them. Attached and generated images are stored in your Puter Drive, so they survive a reload and follow you to another device; deleting a message or a chat reclaims them. Code and tables are derived from the transcript and never stored. |
| **Image tools** | Attach up to four images to a vision-capable model. Attachments are converted to a supported format when needed and shrunk before sending (long edge ≤ 1568 px, ≈1.2 MB each), then sent as data URLs inside `image_url` blocks. Extract text with OCR or generate an image from a prompt. |
| **Voice tools** | Click the microphone to start recording and click again to stop — a recording always stays stoppable, including while a reply streams. The elapsed time is shown, recordings stop automatically after five minutes, and the audio is decoded to 16 kHz mono WAV before transcription. Review the transcription before sending. Read assistant replies aloud. |
| **Export and sharing** | Export the active conversation as Markdown, copy content, or use native sharing where supported. |
| **Local cache and cloud sync** | Keep conversations in browser storage and attempt automatic synchronization when signed in. |
| **Responsive interface** | Switch between light and dark themes and use layouts adapted for desktop and mobile. |

### Model discovery

The model picker renders from the bundled snapshot in [`src/lib/puterModels.generated.ts`](src/lib/puterModels.generated.ts), including provider groups and capability filters. Separately, [`src/lib/models.ts`](src/lib/models.ts) fetches a live catalog from `puter.ai.listModels()` to validate the default model and determine image-input support. Picker entries may differ from current provider availability until the snapshot is refreshed.

## Getting started

### Prerequisites

- **Node.js 22** and npm — matching the Android CI environment.
- **Bun** to run the repository's test suite.
- A **Puter account** for AI features and cloud synchronization.
- A browser with microphone support for voice input; microphone access requires localhost or HTTPS and your permission.

### Run locally

```bash
git clone https://github.com/Nileshsri2022/chat-puter-vision.git
cd chat-puter-vision
npm ci
npm run dev
```

Open **http://localhost:8080**. The Puter SDK is loaded by `index.html`; no provider API keys or `.env` file are needed for the current setup.

### Your first conversation

1. Open the sidebar's **Account** menu and sign in to Puter. Allow the sign-in popup if your browser blocks it.
2. Choose a model from the composer. Image attachments are available for models recognized as vision-capable.
3. Type a message, dictate a draft, or attach images, then send. **Enter** sends a message; **Shift + Enter** adds a new line.
4. Use the message actions to copy, regenerate, read aloud, share, or delete a reply.
5. Use the header's search control to find text in the current chat, or its export menu to download Markdown.
6. Use the header's images control to open the image index for the chat and jump back to any picture you attached or the model generated.

## Development

### Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the dependencies from `package-lock.json`. |
| `npm run dev` | Start the Vite development server on port 8080. |
| `npm run build` | Create the production web bundle in `dist/`. |
| `npm run build:dev` | Build using Vite's development mode. |
| `npm run preview` | Serve the production bundle locally after building. |
| `npm run lint` | Run ESLint across the repository. |
| `npx tsc --noEmit -p tsconfig.app.json` | Type-check the application without emitting files. |
| `npm test` | Run the Bun test suite; Bun must be installed. |

Tests in [`tests/`](tests/) cover streaming, model metadata, media helpers, attachment preparation (`tests/attachments.test.ts`), image conversion and downscaling (`tests/imageConversion.test.ts`), recording/transcription helpers (`tests/audio.test.ts`), account APIs, cloud-sync merging, text-to-speech, Drive export helpers, the image index (`tests/artifacts.test.ts` and the panel render smoke test `tests/artifactsPanel.test.tsx`), code and table extraction and export formats (`tests/artifactBlocks.test.ts`), and responsive-layout guards. SDK calls are mocked, and storage tests use an in-memory `localStorage` shim; these are not live-provider integration tests.

**Known baseline failures:** the existing Drive export test expects the old folder name ([#55](https://github.com/Nileshsri2022/chat-puter-vision/issues/55)), and ESLint reports two blocking violations ([#56](https://github.com/Nileshsri2022/chat-puter-vision/issues/56)). When submitting a change, distinguish these existing failures from any new regressions rather than disabling checks.

### Android

The checked-in [`android/`](android/) project wraps the web app with Capacitor. For local Android development, install JDK 21, Android SDK platform 35, and the Android build tools, then run:

```bash
npm run build
npx cap sync android
npx cap open android
```

The [Android APK workflow](.github/workflows/android-apk.yml) builds release APKs on `v*` tags or a manual workflow run and uploads them as Actions artifacts. It does not automatically publish a GitHub Release. Without repository signing secrets, it uses a temporary key for each run; those builds cannot upgrade installations signed with a different key.

### Project structure

```text
src/
├── components/              # Composer, messages, sidebar, model picker, UI primitives
├── hooks/                   # Toast notifications and media-query subscriptions
├── lib/
│   ├── backend.ts           # Typed Puter SDK and authentication helpers
│   ├── streamingHandler.ts  # Streaming response handling and reasoning-block cleanup
│   ├── models.ts            # Live model validation and vision capabilities
│   ├── puterModels.generated.ts # Bundled picker catalog and category metadata
│   ├── sync.ts              # KV synchronization, merge logic, deletion tombstones
│   ├── attachments.ts       # Image attachments: format conversion, downscaling, data URLs
│   ├── audio.ts             # Recorder container selection, WAV encoding, duration helpers
│   ├── dataUrl.ts           # data: URL encode/decode helpers shared by attachments and speech
│   ├── images.ts            # Image generation
│   ├── ocr.ts               # Text extraction from images
│   ├── speech.ts            # Audio transcription (decodes recordings, sends a data URL)
│   ├── tts.ts               # Read-aloud playback and Markdown-to-speech conversion
│   └── utils/               # Browser persistence, export, highlighting, image conversion
└── pages/Index.tsx          # App state, conversation actions, auth, and sync orchestration
android/                    # Capacitor Android project
tests/                      # Bun tests and mock helpers
.github/workflows/          # Android builds and issue labeling
```

## Storage and service boundaries

- **Browser cache:** conversation history and the active conversation ID are stored in `localStorage`. This is not an encrypted archive or a guaranteed backup.
- **Cloud document:** synchronization uses Puter KV, with per-conversation `updatedAt` timestamps for last-writer-wins merging and deletion tombstones retained for 30 days.
- **Sync triggers:** sign-in, tab focus/visibility changes, and a two-second debounce after local conversation changes. The current sidebar does not display sync status.
- **Network requirements:** cached conversations can be viewed without making AI calls, but generation, OCR, transcription, read-aloud, authentication, and cloud sync depend on external services.
- **Media retention:** generated images may reference temporary hosted URLs. Markdown exports should not be treated as complete media backups.

> **Sync is still being hardened.** There are open issues involving account isolation, reloads, and concurrent edits. Avoid switching accounts in a shared browser with sensitive chats, and export important conversations before testing sync changes. See the [P1 issue queue](https://github.com/Nileshsri2022/chat-puter-vision/issues?q=is%3Aissue%20is%3Aopen%20label%3AP1) for current work.

## Contributing

**Contributions are welcome** — bug fixes, regression tests, accessibility improvements, documentation, and thoughtful UI refinements all help make FreeTalk better.

### Find something to work on

- Browse the [open issues](https://github.com/Nileshsri2022/chat-puter-vision/issues), especially the [P1 queue](https://github.com/Nileshsri2022/chat-puter-vision/issues?q=is%3Aissue%20is%3Aopen%20label%3AP1) for data-loss risks and blocked core flows.
- Comment on an issue before starting substantial work to avoid duplication and agree on scope.
- Have an idea? Open an issue describing the use case and proposed behavior before implementing a large change.
- New to the project? Documentation corrections and focused regression tests are useful starting points.

### Submit a pull request

1. Fork the repository and work on a focused branch in your fork.
2. Follow the setup above and read [`AGENTS.md`](AGENTS.md) for repository-specific development guidance.
3. Keep changes scoped to one issue or improvement. Follow the existing React/TypeScript patterns and do not commit credentials, generated build output, or personal conversation data.
4. Add regression coverage for bug fixes. Prefer mocked SDK calls over real requests that consume credits or require an account.
5. Run the build, application type-check, lint, and tests. Report any existing failures separately. For UI changes, check narrow and wide viewports and both themes.
6. Open a [pull request](https://github.com/Nileshsri2022/chat-puter-vision/pulls) with a summary, the related issue, verification results, and screenshots when the interface changes.

### Report a bug

Include steps to reproduce, expected and actual behavior, browser/device details, and relevant console output. Redact account identifiers, private prompts, and other personal data from logs and screenshots. For suspected security vulnerabilities, avoid publishing exploit details or sensitive data in a public issue; use GitHub's private vulnerability reporting if enabled.

---

<div align="center">

Built with React, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide, Capacitor, and the Puter SDK.

</div>
