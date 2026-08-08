from supabase import create_client, Client
from config import get_settings
from functools import lru_cache

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """Return a cached Supabase client using the anon key (for public operations)."""
    return create_client(settings.supabase_url, settings.supabase_key)


@lru_cache()
def get_supabase_admin() -> Client:
    """Return a cached Supabase client using the service role key (for admin operations)."""
    return create_client(settings.supabase_url, settings.supabase_service_key)
