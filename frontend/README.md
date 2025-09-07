# WA-Agent Frontend

React + TypeScript frontend for the WA-Agent WhatsApp intelligent customer service system.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: TanStack Router
- **State Management**: TanStack Query
- **UI Components**: Radix UI + Tailwind CSS
- **API Client**: Hono RPC Client
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Bun >= 1.0.0
- Node.js >= 18

### Installation

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env
```

### Development

```bash
# Start development server
bun run dev

# The app will be available at http://localhost:5173
```

### Building

```bash
# Build for production
bun run build

# Preview production build
bun run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/       # React components
│   │   └── layouts/     # Layout components
│   ├── lib/             # Utility functions and API client
│   ├── router.tsx       # Router configuration
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── public/              # Static assets
└── index.html          # HTML template
```

## Features

- ✅ Type-safe routing with TanStack Router
- ✅ Efficient data fetching with TanStack Query
- ✅ Accessible UI components with Radix UI
- ✅ Utility-first CSS with Tailwind
- ✅ Type-safe API calls with Hono RPC
- ✅ Hot Module Replacement (HMR) with Vite
- ✅ TypeScript for type safety

## Available Routes

- `/` - Landing page
- `/dashboard` - Main dashboard
- `/dashboard/knowledge-bases` - Knowledge base management
- `/dashboard/agents` - Agent configuration
- `/dashboard/sessions` - WhatsApp session management

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8787` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | - |
| `VITE_ENABLE_DEV_TOOLS` | Enable React Query and Router dev tools | `true` |

## Development Tips

### Using Radix UI Components

Radix UI components are unstyled by default. Use Tailwind classes to style them:

```tsx
import * as Dialog from '@radix-ui/react-dialog'

<Dialog.Root>
  <Dialog.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
    Open
  </Dialog.Trigger>
  <Dialog.Content className="bg-white p-6 rounded-lg shadow-xl">
    Content here
  </Dialog.Content>
</Dialog.Root>
```

### API Calls with TanStack Query

```tsx
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

function useKnowledgeBases() {
  return useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: async () => {
      const res = await apiClient.api['knowledge-base'].$get()
      return await res.json()
    }
  })
}
```

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint
