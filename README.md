# AI Chat - Multi-Model Assistant

A modern, responsive AI chat application that integrates with multiple AI models through the Puter platform. Chat with Claude, Grok, Mistral, Perplexity, and OpenRouter AI models in a unified interface with conversation management, image analysis capabilities, and a sleek design.

## ✨ Key Features

- **Multi-Model Support**: Choose from Claude, Grok, Mistral, Perplexity, and OpenRouter AI models
- **Conversation Management**: Create, manage, and switch between multiple conversations
- **Image Analysis**: Upload and analyze images with Perplexity models
- **Real-time Streaming**: Live responses from AI models
- **Authentication**: Secure sign-in through Puter platform
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS

## 🤖 Supported AI Models

### OpenRouter (Unified API Gateway)
OpenRouter provides access to hundreds of AI models from various providers through a single, unified API. No API keys or backend setup required - everything works through Puter.js!

**Key Features:**
- Access to 100+ AI models from OpenAI, Anthropic, Meta, Google, Mistral, and more
- User-pays model (you only pay for what you use)
- No API keys or server-side setup required
- Streaming responses supported
- Vision capabilities for compatible models

### Claude (Anthropic)
- Claude Sonnet 4 (Recommended)
- Claude Opus 4 & 4.1
- Claude Sonnet 4.5
- Claude 3.7 Sonnet & Opus

### Mistral AI
- Codestral series (Code generation specialists)
- Devstral series (Development focused)
- Magistral series
- Ministral series (Lightweight models)
- Mistral Large (Flagship model)
- Mixtral series (Mixture of experts)
- Pixtral 12B (Vision capable)

### Perplexity AI
- R1 1776 (Historical research)
- Sonar (General research - Recommended)
- Sonar Deep Research (Comprehensive analysis)
- Sonar Pro & Reasoning Pro (Professional/Advanced reasoning)

### Grok (xAI)
- Grok 4 (Latest model - Recommended)
- Grok 4 Fast (Free tier)
- Grok 3 series
- Grok 2 Vision (Vision capable)
- Grok Code Fast (Code specialist)

### OpenRouter (Unified API)
- **GPT-4o** (OpenAI's latest flagship model - Recommended)
- **GPT-4o Mini** (Fast and efficient GPT-4o)
- **o1 & o1 Mini** (OpenAI's reasoning models)
- **Claude Sonnet 4.5 & Opus 4** (Anthropic's latest models)
- **Llama 3.1 405B/70B/8B** (Meta's open models)
- **Mistral Large & Mixtral 8x22B** (Mistral's models)
- **Gemini 2.0 Flash & Pro 1.5** (Google's models)
- **Grok 4** (xAI's latest model)
- **DeepSeek Chat** (DeepSeek's model)
- **Qwen 2.5 72B** (Alibaba's model)
- And hundreds more models from various providers

## 🛠 Technology Stack

- **Frontend**: React 18, TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: React Query (TanStack)
- **Routing**: React Router
- **Icons**: Lucide React
- **AI Integration**: Puter SDK
- **Development**: ESLint, TypeScript

## 🚀 Quick Start

### Prerequisites

- Node.js & npm (or bun) installed
- A Puter account for AI model access

### Installation

1. **Clone the repository**
   ```sh
   git clone <YOUR_GIT_URL>
   cd <YOUR_PROJECT_NAME>
   ```

2. **Install dependencies**
   ```sh
   npm install
   ```

3. **Start development server**
   ```sh
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

## 📖 Usage Guide

### Getting Started

1. **Sign In**: Click the authentication button to sign in with Puter
2. **Choose a Model**: Select from Claude, Grok, Mistral, Perplexity, or OpenRouter models
3. **Start Chatting**: Type your message and press Enter or click Send

### Model Selection

- Use the model selector above the chat input to switch between AI providers
- Each provider has multiple models optimized for different tasks
- Perplexity models support image analysis
- OpenRouter provides access to 100+ models from various providers

### Image Analysis (Perplexity Only)

1. Select a Perplexity model
2. Click the image icon in the chat input
3. Upload up to 4 images
4. Ask questions about the uploaded images

### Conversation Management

- **New Conversation**: Click the "+" button in the sidebar
- **Switch Conversations**: Click on any conversation in the sidebar
- **Auto-titling**: Conversations are automatically titled from your first message

## 🏗 Project Structure

```
src/
├── components/
│   ├── ui/           # shadcn/ui components
│   ├── AuthButton.tsx
│   ├── ChatInput.tsx
│   ├── ChatMessage.tsx
│   ├── ClaudeLogo.tsx
│   ├── ConversationSidebar.tsx
│   └── ModelSelector.tsx
├── hooks/
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── lib/
│   ├── puter.ts      # Puter SDK integration
│   └── utils.ts
├── pages/
│   ├── Index.tsx     # Main chat interface
│   └── NotFound.tsx
├── App.tsx
└── main.tsx
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Key Components

- **Index.tsx**: Main chat interface with authentication and conversation management
- **ChatInput.tsx**: Message input with model selection and image upload
- **ModelSelector.tsx**: Tabbed interface for choosing AI models
- **ConversationSidebar.tsx**: Conversation list and management
- **puter.ts**: AI model integration and authentication utilities

## 🚀 Deployment

### Via Lovable

1. Open [Lovable](https://lovable.dev/projects/c91edb81-9be1-4caa-97aa-d26e8fa093b1)
2. Click on **Share → Publish**
3. Your app will be deployed automatically

### Custom Domain

1. Go to **Project → Settings → Domains**
2. Click **Connect Domain**
3. Follow the setup instructions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is built with [Lovable](https://lovable.dev) and follows their terms of service.

## ⚠️ Important Notes

- **Authentication Required**: You must sign in with Puter to access AI models
- **AI Model Limits**: Usage may be subject to Puter platform limits
- **Image Analysis**: Only available with Perplexity models
- **OpenRouter Models**: Access to 100+ models through unified API
- **Browser Compatibility**: Requires modern browsers with ES6+ support

## 🆘 Troubleshooting

### Authentication Issues
- Ensure popups are allowed for this site
- Try the "Force Auth Check" button on the sign-in screen
- Check browser console for error messages

### Model Selection Issues
- Make sure you're signed in to Puter
- Try refreshing the page
- Check that the selected model is available

### Image Upload Issues
- Ensure you're using a Perplexity model
- Check file size limits (typically < 10MB per image)
- Supported formats: PNG, JPG, JPEG, GIF, WebP

---

Built with ❤️ using [Lovable](https://lovable.dev)
