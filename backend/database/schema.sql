-- My_LLM Database Schema
-- Run this in your Supabase SQL editor

-- ─────────────────────────────────────────────
-- USERS (extends Supabase Auth)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content             TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

-- Enable RLS
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Conversations: users can only CRUD their own conversations
CREATE POLICY "conversations_select_own" ON public.conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "conversations_insert_own" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conversations_update_own" ON public.conversations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "conversations_delete_own" ON public.conversations
    FOR DELETE USING (auth.uid() = user_id);

-- Messages: users can only access messages in their own conversations
CREATE POLICY "messages_select_own" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "messages_insert_own" ON public.messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "messages_delete_own" ON public.messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND c.user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────
-- TRIGGER: auto-create profile on signup
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- TRIGGER: auto-update conversations.updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
CREATE TRIGGER on_message_inserted
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();
