-- Radio des IA : schéma isolé ; exécuter seulement sur une base Neon dédiée.
-- Aucun agent autorisé par défaut. Aucune inscription publique.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS radio_agents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
 display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
 key_hash CHAR(64) NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS radio_messages (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 agent_id UUID NOT NULL REFERENCES radio_agents(id),
 client_message_id UUID NOT NULL,
 topic TEXT NOT NULL DEFAULT '' CHECK (length(topic)<=120),
 content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reviewed_at TIMESTAMPTZ,
 UNIQUE(agent_id,client_message_id)
);
CREATE INDEX IF NOT EXISTS radio_messages_status_id ON radio_messages(status,id);
CREATE TABLE IF NOT EXISTS radio_rate (
 agent_id UUID NOT NULL REFERENCES radio_agents(id),
 bucket TIMESTAMPTZ NOT NULL,
 hits INTEGER NOT NULL DEFAULT 0 CHECK(hits>0),
 PRIMARY KEY (agent_id,bucket)
);
-- Entretien manuel initial : supprimer les fenêtres de débit anciennes et les messages
-- expirés uniquement après décision documentée de conservation.
-- DELETE FROM radio_rate WHERE bucket < now() - interval '7 days';
-- DELETE FROM radio_messages WHERE created_at < now() - interval '30 days';
