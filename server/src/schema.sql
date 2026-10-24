CREATE TABLE IF NOT EXISTS authors (
  author_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  city        TEXT,
  joined_date DATE
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('author','admin')),
  author_id     TEXT REFERENCES authors(author_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS books (
  book_id          TEXT PRIMARY KEY,
  author_id        TEXT NOT NULL REFERENCES authors(author_id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  isbn             TEXT,
  genre            TEXT,
  publication_date DATE,              -- NULL while in production
  status           TEXT NOT NULL,
  mrp              INTEGER,           -- NULL while in production
  royalty_per_copy INTEGER,
  copies_sold      INTEGER NOT NULL DEFAULT 0,
  royalty_earned   INTEGER NOT NULL DEFAULT 0,
  royalty_paid     INTEGER NOT NULL DEFAULT 0,
  royalty_pending  INTEGER NOT NULL DEFAULT 0,
  last_payout_date DATE,
  print_partner    TEXT,
  available_on     TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);

CREATE TABLE IF NOT EXISTS tickets (
  id              SERIAL PRIMARY KEY,
  author_id       TEXT NOT NULL REFERENCES authors(author_id) ON DELETE CASCADE,
  book_id         TEXT REFERENCES books(book_id) ON DELETE SET NULL, -- NULL = General / Account Level
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  attachments     TEXT[] NOT NULL DEFAULT '{}',   -- file names only (upload is UI-only per brief)
  status          TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  category        TEXT NOT NULL DEFAULT 'General Inquiry',
  category_source TEXT NOT NULL DEFAULT 'rules' CHECK (category_source IN ('rules','ai','admin')),
  priority        TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  priority_source TEXT NOT NULL DEFAULT 'rules' CHECK (priority_source IN ('rules','ai','admin')),
  ai_status       TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','done','failed','skipped')),
  ai_reason       TEXT,
  ai_draft        TEXT,                           -- cached draft: generated once, regenerated only on request
  ai_draft_source TEXT CHECK (ai_draft_source IN ('ai','template')),
  ai_draft_at     TIMESTAMPTZ,
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- Public conversation (visible to the author)
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('author','admin')),
  sender_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);

-- Internal notes (NEVER returned by author endpoints)
CREATE TABLE IF NOT EXISTS ticket_notes (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_ticket ON ticket_notes(ticket_id);

-- One row per LLM call: powers cost monitoring on the admin dashboard
CREATE TABLE IF NOT EXISTS ai_calls (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER,
  kind          TEXT NOT NULL,
  model         TEXT,
  ok            BOOLEAN NOT NULL,
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
