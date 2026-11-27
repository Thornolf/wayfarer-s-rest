-- Content: the draft (one row per item, plus the settings under collection 'settings' and an empty
-- id), every write kept as a revision, and the counter that stamps them all.
CREATE TABLE content_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
) STRICT;
INSERT INTO content_counter (id, version) VALUES (1, 0);

CREATE TABLE content_entries (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (collection, id)
) STRICT;
CREATE INDEX content_entries_version ON content_entries (version);

CREATE TABLE content_revisions (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  written_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (collection, id, version)
) STRICT;

-- A publication copies nothing: it records the counter value the phone may see up to.
CREATE TABLE publications (
  version INTEGER PRIMARY KEY,
  published_at TEXT NOT NULL
) STRICT;

-- Access: only hashes of the tokens are stored.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
) STRICT;

-- What the phone sends back. The payload is the request body, stored whole.
CREATE TABLE night_reports (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
) STRICT;
CREATE INDEX night_reports_started ON night_reports (started_at);
CREATE INDEX night_reports_character ON night_reports (character_id, started_at);

CREATE TABLE character_backups (
  character_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (character_id, revision)
) STRICT;
