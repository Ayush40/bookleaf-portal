# BookLeaf Portal Write-up

## What the app does

The app connects authors with the support team. Authors can check their books and submit tickets. Admins can review tickets, change their status, and reply.

## How AI is used

AI is used for two simple tasks:

1. Classify a new ticket.
2. Create a reply draft for an admin.

The ticket is saved before AI runs, so the app still works when the API key is missing or the AI service is unavailable. Admins review and edit every draft before sending it.

The app calculates royalty numbers in the server code. This keeps dates and amounts accurate instead of asking the AI to calculate them.

## Main technical choices

- React and Vite are used for the frontend.
- Express and PostgreSQL are used for the backend.
- Plain SQL keeps the database queries easy to see.
- The Express server can serve the frontend after a production build.
- The frontend polls for new ticket messages. This is simpler than using WebSockets.

## Simple setup

1. Install Node.js 18 or newer.
2. Create a PostgreSQL database.
3. Run `npm run install:all`.
4. Add `DATABASE_URL` and `JWT_SECRET` to `server/.env`.
5. Add `GEMINI_API_KEY` if AI features are needed.
6. Run the server and client in two terminals.

The server creates the database tables and demo data when it starts.

## Limitations

This is a small demo project. It does not yet include password reset, real file uploads, email notifications, or a full automated test suite. For production, authentication should use secure httpOnly cookies and AI work should run in a shared job queue.
