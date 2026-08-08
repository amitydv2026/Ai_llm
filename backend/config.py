from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

# Look for .env in backend/ first, then fall back to parent directory (project root)
_BASE_DIR = Path(__file__).parent
_ENV_FILE = _BASE_DIR / ".env" if (_BASE_DIR / ".env").exists() else _BASE_DIR.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    supabase_url: str
    supabase_key: str
    supabase_service_key: str
    groq_api_key: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours


@lru_cache()
def get_settings() -> Settings:
    return Settings()
