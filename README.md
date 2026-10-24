# BookLeaf Portal

BookLeaf Portal is a small support app for authors and admins.

- Authors can view books, royalties, and support tickets.
- Admins can manage tickets and send replies.
- Gemini can help classify tickets and write draft replies.

## Setup

### Requirements

- Node.js 18 or newer
- A PostgreSQL database
- A Gemini API key (optional; the app also works without AI)

### Install

```bash
npm run install:all
```

### Configure the server

Create `server/.env`:

```env
DATABASE_URL=your-postgres-connection-string
JWT_SECRET=your-long-secret
GEMINI_API_KEY=your-gemini-key
```

`GEMINI_API_KEY` can be empty if AI features are not needed.

### Start the app

Open two terminals.

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

Open http://localhost:5173.

The server creates the tables and loads demo data on its first start.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bookleaf.com` | `Admin@123` |
| Support admin | `support@bookleaf.com` | `Admin@123` |
| Author | `ananya.reddy@email.com` | `Author@123` |

## Project folders

- `client/`: React and Vite frontend
- `server/`: Express API, PostgreSQL code, and AI code
- `docs/API.md`: API reference

## Production build

```bash
npm run build
npm start
```

The server serves the built frontend in production.
