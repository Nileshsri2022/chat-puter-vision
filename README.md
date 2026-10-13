# 🤖 AI Chat - Multi-Model Assistant

A modern, feature-rich AI chat application built with React, TypeScript, and the Puter SDK. This application provides seamless access to multiple leading AI models through a beautiful, responsive interface with support for multimodal interactions including text and image inputs.

![AI Chat Application](https://img.shields.io/badge/React-18.3.1-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue) ![Vite](https://img.shields.io/badge/Vite-5.4.19-purple) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-cyan)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Supported AI Models](#supported-ai-models)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Key Components](#key-components)
- [Configuration](#configuration)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Contributing](#contributing)
- [License](#license)

---

## 🌟 Overview

**AI Chat** is a sophisticated web application that leverages the **Puter SDK** to provide unified access to multiple AI models from leading providers including Claude (Anthropic), Grok (xAI), Mistral AI, Perplexity, Kimi (Moonshot AI), OpenAI, and OpenRouter. The application features a clean, modern UI built with Shadcn/ui components and supports both text and image-based interactions.

### Why This Project?

- **Multi-Model Support**: Switch between different AI models seamlessly without managing multiple API keys
- **Unified Interface**: Access all models through Puter's unified AI API
- **Multimodal Capabilities**: Send images along with text prompts for visual analysis
- **Conversation Management**: Create, manage, and switch between multiple chat conversations
- **Real-time Streaming**: See AI responses as they're generated in real-time
- **Modern UI/UX**: Beautiful, responsive design with dark mode support

---

## ✨ Features

### Core Features

- **🤖 Multi-Model AI Support**
  - Access to 50+ AI models from 7+ providers
  - Easy model switching via dropdown selector
  - Model-specific capabilities and optimizations

- **🔐 Puter Authentication**
  - Secure sign-in via Puter SDK popup
  - Documented sign-in check (`puter.auth.isSignedIn()`)
  - Sign-out from the header
  - User profile integration

- **💬 Conversation Management**
  - Create unlimited conversations
  - Auto-generated conversation titles
  - Delete and switch between conversations
  - Persistent conversation history

- **🖼️ Multimodal Input**
  - Upload and attach images to prompts (max 4)
  - Support for multiple image formats (AVIF/HEIC auto-converted to PNG)
  - Image preview before sending
  - Vision-gated per model via live `puter.ai.listModels()` modalities data
  - Images are sent as `image_url` content blocks (the SDK's own wire form)

- **⚡ Real-time Streaming**
  - Stream AI responses as they're generated
  - Documented chunk parsing (`type: "text"` → `text`), error-chunk handling
  - Smooth scrolling and animations
  - Visual streaming indicators

- **💭 Conversation Memory**
  - Prior turns are sent as a messages array, so the model keeps context
  - History capped at the last 20 messages to bound context size

- **🎨 Modern UI/UX**
  - Responsive design (mobile, tablet, desktop)
  - Dark/Light theme toggle
  - Smooth animations and transitions
  - Markdown formatting support
  - Syntax highlighting for code blocks

- **📁 Conversation Persistence**
  - Conversations saved to localStorage (per-browser)
  - Export any conversation as Markdown or JSON
  - Auto-generated conversation titles

### Additional Features

- Error boundary for graceful error handling
- Toast notifications for user feedback
- Skeleton loaders for better UX
- Keyboard shortcuts (Enter to send, Shift+Enter for new line)
- Auto-scroll to latest messages
- Model-specific placeholders and hints

---

## 🛠️ Technology Stack

### Frontend Framework
- **React** (v18.3.1) - UI library
- **TypeScript** (v5.8.3) - Type-safe JavaScript
- **Vite** (v5.4.19) - Build tool and dev server

### Styling
- **TailwindCSS** (v3.4.17) - Utility-first CSS framework
- **Shadcn/ui** - High-quality React components
- **Radix UI** - Accessible component primitives
- **tailwindcss-animate** - Animation utilities

### State Management & Data Fetching
- **TanStack Query** (v5.83.0) - Server state management
- **React Router DOM** (v6.30.1) - Client-side routing

### Form Handling
- **React Hook Form** (v7.61.1) - Form state management
- **Zod** (v3.25.76) - Schema validation
- **@hookform/resolvers** - Form validation resolvers

### Platform Integration
- **Puter SDK** (v2) - Authentication, AI API, and file storage

### UI Components & Utilities
- **Lucide React** (v0.462.0) - Icon library
- **date-fns** (v3.6.0) - Date utilities
- **clsx** & **tailwind-merge** - Conditional class names
- **Sonner** - Toast notifications
- **Recharts** (v2.15.4) - Charting library

### Development Tools
- **ESLint** (v9.32.0) - Code linting
- **TypeScript ESLint** (v8.38.0) - TypeScript linting
- **Autoprefixer** (v10.4.21) - CSS vendor prefixing
- **PostCSS** (v8.5.6) - CSS processing

---

## 🤖 Supported AI Models

The model list is **validated at runtime** against `puter.ai.listModels()` — the
documented canonical source of model IDs. Models that no longer resolve are
hidden automatically, so the selector never offers dead models. The default
model is `gpt-5.4-nano` (Puter's documented default for `puter.ai.chat`).

Curated provider tabs (all IDs verified live on 2026-10-13):

| Provider | Example models |
|----------|---------------|
| Claude (Anthropic) | `claude-sonnet-5`, `claude-opus-5-5`, `claude-haiku-5-5` |
| OpenAI | `gpt-5.4-nano`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-4o` |
| Grok (xAI) | `grok-4.7`, `grok-4.6`, `grok-4.5` |
| Mistral AI | `mistral-large-4`, `mistral-medium-2604`, `codestral-2508` |
| Perplexity | `openrouter:perplexity/sonar`, `openrouter:perplexity/sonar-pro` |
| Kimi (Moonshot AI) | `infron:moonshotai/kimi-k3`, `infron:moonshotai/kimi-k2.6` |
| OpenRouter | DeepSeek, Llama, Gemini, Gemma, Qwen, Phi and more |

Vision support per model comes from the catalog's `modalities` data
(`input` includes `"image"`), not from name guessing.

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **Package Manager**
   - **npm** (comes with Node.js) or
   - **bun** (recommended for faster installs)
   - Install bun: `npm install -g bun`

3. **Puter Account**
   - Sign up at [puter.com](https://puter.com)
   - Required for authentication and AI API access

4. **Modern Web Browser**
   - Chrome, Firefox, Safari, or Edge (latest version)

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Nileshsri2022/chat-puter-vision.git
cd chat-puter-vision
```

### 2. Install Dependencies

Using **bun** (recommended):
```bash
bun install
```

Or using **npm**:
```bash
npm install
```

### 3. Verify Puter SDK

The Puter SDK is loaded via CDN in `index.html`:
```html
<script src="https://js.puter.com/v2/"></script>
```

No additional configuration needed!

---

## 💻 Usage

### Development Server

Start the development server:

```bash
# Using bun
bun run dev

# Using npm
npm run dev
```

The application will be available at **http://localhost:8080**

### First-Time Setup

1. **Open the Application**
   - Navigate to `http://localhost:8080` in your browser

2. **Sign In**
   - Click the "Sign in to Puter" button
   - Complete the Puter authentication flow
   - Allow popup windows if prompted

3. **Start Chatting**
   - Select an AI model from the dropdown
   - Type your message in the input field
   - Press Enter or click the send button

### Using Multimodal Features

For models that support vision (Claude, Grok Vision, GPT-4o, etc.):

1. Click the **Upload** button (📤) in the chat input
2. Select one or more images (max 4)
3. Images will be uploaded to Puter filesystem
4. Type your prompt and send
5. The AI will analyze the images along with your text

### Managing Conversations

- **New Conversation**: Click the "+" button in the sidebar
- **Switch Conversation**: Click on any conversation in the sidebar
- **Delete Conversation**: Click the trash icon next to a conversation
- **Auto-naming**: First message becomes the conversation title

---

## 📁 Project Structure

```
chat-puter-vision/
├── public/                      # Static assets
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
│
├── src/                         # Source code
│   ├── components/              # React components
│   │   ├── ui/                  # Shadcn/ui components (49 files)
│   │   ├── AuthButton.tsx       # Authentication component
│   │   ├── ChatInput.tsx        # Message input with file upload
│   │   ├── ChatMessage.tsx      # Message display with formatting
│   │   ├── ClaudeLogo.tsx       # Claude logo SVG
│   │   ├── ConversationSidebar.tsx  # Conversation list
│   │   ├── ErrorBoundary.tsx    # Error handling
│   │   ├── ModelSelector.tsx    # AI model dropdown (50+ models)
│   │   ├── SkeletonLoader.tsx   # Loading states
│   │   └── ThemeToggle.tsx      # Dark/light mode toggle
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── use-mobile.tsx       # Mobile detection
│   │   └── use-toast.ts         # Toast notifications
│   │
│   ├── lib/                     # Utility libraries
│   │   ├── puter.ts             # Puter SDK integration
│   │   └── utils.ts             # Helper functions
│   │
│   ├── pages/                   # Page components
│   │   ├── Index.tsx            # Main chat page
│   │   └── NotFound.tsx         # 404 page
│   │
│   ├── App.css                  # Global styles
│   ├── App.tsx                  # Root component
│   ├── index.css                # Tailwind imports + custom CSS
│   ├── main.tsx                 # Application entry point
│   └── vite-env.d.ts            # Vite type declarations
│
├── .gitignore                   # Git ignore rules
├── bun.lockb                    # Bun lock file
├── components.json              # Shadcn/ui configuration
├── eslint.config.js             # ESLint configuration
├── index.html                   # HTML entry point
├── package.json                 # Dependencies and scripts
├── package-lock.json            # npm lock file
├── postcss.config.js            # PostCSS configuration
├── README.md                    # This file
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.app.json            # TypeScript app config
├── tsconfig.json                # TypeScript base config
├── tsconfig.node.json           # TypeScript node config
└── vite.config.ts               # Vite configuration
```

---

## 🔑 Key Components

### 1. **Index.tsx** (Main Chat Page)
The core component that orchestrates the entire chat experience:

- **State Management**: Manages conversations, messages, streaming state
- **Authentication**: Checks auth status and handles user sessions
- **Message Handling**: Processes user input and AI responses
- **Model Routing**: Routes requests to appropriate AI providers
- **File Upload**: Handles image uploads to Puter filesystem

**Key Functions:**
- `handleSendMessage()` - Processes and sends messages to AI
- `handleNewConversation()` - Creates new chat sessions
- `handleDeleteConversation()` - Removes conversations
- `checkAuthStatus()` - Verifies user authentication

### 2. **ChatInput.tsx** (Message Input)
Sophisticated input component with multimodal support:

- **Text Input**: Textarea with auto-resize and keyboard shortcuts
- **Image Upload**: File selection with preview
- **Model Selection**: Dropdown to switch AI models
- **File Management**: Upload files to Puter filesystem
- **Validation**: Checks model capabilities (vision support)

**Features:**
- Drag-and-drop support
- Multiple image selection (max 4)
- Image preview with remove option
- Model-specific placeholders
- Upload progress indication

### 3. **ChatMessage.tsx** (Message Display)
Renders messages with rich formatting:

- **Markdown Support**: Headers, bold, italic, code blocks
- **Syntax Highlighting**: Code block formatting
- **Image Display**: Shows uploaded images
- **Model Icons**: Visual indicators for different AI models
- **Streaming Animation**: Pulse effect during generation

**Formatting Features:**
- Headers (H1, H2, H3)
- Bold and italic text
- Inline code and code blocks
- Lists (ordered and unordered)
- Blockquotes
- Line breaks and paragraphs

### 4. **ModelSelector.tsx** (AI Model Dropdown)
Comprehensive model selection interface:

- **50+ Models**: Organized by provider
- **Search**: Filter models by name
- **Categorization**: Grouped by provider type
- **Model Info**: Display capabilities and features
- **Icons**: Visual provider identification

**Providers:**
- Claude (Anthropic)
- Mistral AI
- Perplexity
- Grok (xAI)
- Kimi (Moonshot AI)
- OpenAI
- OpenRouter

### 5. **AuthButton.tsx** (Authentication)
Handles Puter authentication flow:

- **Sign In**: Initiates Puter OAuth flow
- **Status Check**: Periodic auth verification
- **User Display**: Shows signed-in user info
- **Error Handling**: Manages auth failures

### 6. **ConversationSidebar.tsx** (Conversation List)
Manages conversation navigation:

- **Conversation List**: Shows all chat sessions
- **New Conversation**: Create button
- **Delete**: Remove conversations
- **Active State**: Highlights current conversation
- **Mobile Support**: Collapsible on small screens

### 7. **puter.ts** (Puter SDK Integration)
Typed wrapper around the Puter.js SDK (`src/lib/puter.ts`), following the
documented API surface:

**Authentication (documented):**
- `checkAuthStatus()` - synchronous `puter.auth.isSignedIn()` check
- `signIn()` - popup sign-in (must be called from a user gesture)
- `signOut()` - sign out (returns nothing, per docs)
- `getCurrentUser()` - async `puter.auth.getUser()` wrapper

**AI (see `src/lib/streamingHandler.ts`):**
- `streamAIResponse()` - single unified streaming function: builds a
  documented messages array (with conversation history), sends images as
  `image_url` content blocks, parses `type: "text"` chunks, surfaces
  `type: "error"` chunks and `network_error` / `request_timeout` throws

**Models (see `src/lib/models.ts`):**
- `getModelCatalog()` - one cached `puter.ai.listModels()` call per session
- `isModelAvailable()` / `modelSupportsVision()` - runtime ID validation and
  vision gating from the catalog's `modalities` data
- `DEFAULT_MODEL_ID` - `gpt-5.4-nano`, the documented chat default

### 8. **utils.ts** (Utility Functions)
Helper functions for common tasks:

**File Upload:**
- `uploadFilesToPuter()` - Upload multiple files
- `uploadFileToPuter()` - Upload single file
- `getPuterFileUrl()` - Generate public URLs

**Styling:**
- `cn()` - Conditional class name merger

---

## ⚙️ Configuration

### Vite Configuration (`vite.config.ts`)

```typescript
export default defineConfig({
  server: {
    host: "::",      // Listen on all interfaces
    port: 8080,      // Development server port
  },
  plugins: [
    react(),         // React plugin with SWC
    componentTagger() // Lovable component tagger
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // Path alias
    },
  },
});
```

### Tailwind Configuration (`tailwind.config.ts`)

Custom theme with:
- **Dark Mode**: Class-based dark mode
- **Custom Colors**: HSL-based color system
- **Animations**: Accordion, fade, slide animations
- **Typography**: Responsive font sizes
- **Border Radius**: Customizable radius variables

### TypeScript Configuration

Three config files for different contexts:
- `tsconfig.json` - Base configuration
- `tsconfig.app.json` - Application code
- `tsconfig.node.json` - Node/build scripts

---

## 🔧 Development

### Available Scripts

```bash
# Start development server
npm run dev
# or
bun run dev

# Build for production
npm run build
# or
bun run build

# Build for development (with source maps)
npm run build:dev
# or
bun run build:dev

# Preview production build
npm run preview
# or
bun run preview

# Run ESLint
npm run lint
# or
bun run lint
```

### Development Workflow

1. **Start Dev Server**: `bun run dev`
2. **Make Changes**: Edit files in `src/`
3. **Hot Reload**: Changes reflect immediately
4. **Check Console**: Monitor for errors/warnings
5. **Test Features**: Verify functionality
6. **Lint Code**: `bun run lint`
7. **Commit Changes**: Use meaningful commit messages

### Adding New AI Models

To add a new model to `ModelSelector.tsx`:

```typescript
// 1. Add to appropriate model array
const NEW_PROVIDER_MODELS: AIModel[] = [
  {
    id: "provider/model-name",
    name: "Model Display Name",
    type: "provider",
    description: "Model description"
  }
];

// 2. Add to allModels array in Index.tsx
const allModels: AIModel[] = [
  ...CLAUDE_MODELS,
  ...MISTRAL_MODELS,
  // ... other models
  ...NEW_PROVIDER_MODELS
];

// 3. Add streaming function in puter.ts
export async function streamNewProviderResponse(
  prompt: string,
  onChunk: (text: string) => void,
  onComplete: (fullContent: string) => void,
  onError: (error: Error) => void,
  model: string,
  image_url?: string
): Promise<void> {
  // Implementation
}

// 4. Add routing in Index.tsx handleSendMessage()
if (selectedModelId.startsWith("provider/")) {
  await streamNewProviderResponse(...);
}
```

### Customizing Themes

Edit `src/index.css` to customize colors:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  /* ... more variables */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode variables */
}
```

---

## 🏗️ Building for Production

### Production Build

```bash
# Create optimized production build
npm run build
# or
bun run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
# or
bun run preview
```

### Deployment Options

#### 1. **Puter Hosting** (Recommended)
Deploy directly to Puter platform:
```bash
# Install Puter CLI
npm install -g puter

# Login
puter login

# Deploy
puter deploy
```

#### 2. **Vercel**
```bash
npm install -g vercel
vercel
```

#### 3. **Netlify**
```bash
npm install -g netlify-cli
netlify deploy
```

#### 4. **Static Hosting**
Upload `dist/` folder to any static hosting service:
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront
- Firebase Hosting

### Environment Variables

No environment variables required! The Puter SDK is loaded via CDN and handles all authentication and API access.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs

1. Check existing issues
2. Create a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

### Suggesting Features

1. Open an issue with the "enhancement" label
2. Describe the feature and use case
3. Explain why it would be valuable

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- Follow existing code patterns
- Use TypeScript for type safety
- Write meaningful commit messages
- Add comments for complex logic
- Keep components focused and reusable

---

## 📄 License

This project is licensed under the **MIT License** - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **Puter** - For the amazing SDK and platform
- **Anthropic** - Claude AI models
- **xAI** - Grok models
- **Mistral AI** - Mistral models
- **Perplexity** - Research-oriented models
- **OpenAI** - GPT models
- **Shadcn/ui** - Beautiful UI components
- **Radix UI** - Accessible primitives
- **Tailwind CSS** - Utility-first CSS framework

---

## 📞 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/Nileshsri2022/chat-puter-vision/issues)
- **Puter Documentation**: [docs.puter.com](https://docs.puter.com)
- **Puter Community**: [puter.com/community](https://puter.com/community)

---

## 🔮 Roadmap

### Planned Features

- [ ] **Conversation Export**: Export chats as JSON, Markdown, or PDF
- [ ] **Voice Input**: Speech-to-text for hands-free interaction
- [ ] **Code Execution**: Run code snippets directly in chat
- [ ] **Plugins System**: Extend functionality with custom plugins
- [ ] **Collaborative Chats**: Share conversations with others
- [ ] **Advanced Search**: Search across all conversations
- [ ] **Custom Themes**: User-defined color schemes
- [ ] **Offline Mode**: Cache conversations for offline access
- [ ] **Mobile App**: Native iOS and Android apps
- [ ] **Browser Extension**: Quick access from browser toolbar

### In Progress

- [x] Multi-model support
- [x] Multimodal input (images)
- [x] Real-time streaming
- [x] Conversation management
- [x] Dark mode
- [x] File uploads

---

## 📊 Statistics

- **1 unified streaming function** (`streamAIResponse`) for all providers
- **9 shadcn/ui components** (button, toast, scroll-area, input, dropdown-menu, badge, textarea — only what's used)
- **11 runtime dependencies** (React, Radix primitives in use, Tailwind, lucide)
- **100% TypeScript** for type safety
- **Typed Puter SDK surface** (no `any`, no `@ts-ignore`)
- **Responsive Design** for all screen sizes

---

## 🎯 Use Cases

This application is perfect for:

- **Developers**: Code generation, debugging, documentation
- **Researchers**: Deep research with Perplexity models
- **Writers**: Content creation, editing, brainstorming
- **Students**: Learning, homework help, explanations
- **Designers**: Visual analysis with vision models
- **Business**: Data analysis, report generation
- **General Users**: Everyday questions and tasks

---

## 🔒 Privacy & Security

- **No Data Collection**: Your conversations are stored locally
- **Secure Authentication**: Puter handles all auth securely
- **HTTPS Only**: All API calls are encrypted
- **No Third-Party Tracking**: No analytics or tracking scripts
- **Open Source**: Full transparency of code

---

## 📚 Additional Resources

### Documentation
- [Puter SDK Documentation](https://docs.puter.com)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Shadcn/ui Documentation](https://ui.shadcn.com)

### Tutorials
- [Building with Puter](https://docs.puter.com/tutorials)
- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook)

---

**Made with ❤️ by [Nileshsri2022](https://github.com/Nileshsri2022)**

**Powered by [Puter](https://puter.com) 🚀**
