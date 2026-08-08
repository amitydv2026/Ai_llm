from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from config import get_settings
from database.supabase import get_supabase, get_supabase_admin
from schemas.auth import UserProfile

settings = get_settings()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def verify_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        return payload
    except JWTError:
        return None


def signup_user(name: str, email: str, password: str):
    """
    Register a new user via Supabase Auth.
    Raises an exception on failure (rate limit, duplicate email, etc.)
    """
    client = get_supabase()
    response = client.auth.sign_up(
        {
            "email": email,
            "password": password,
            "options": {"data": {"name": name}},
        }
    )
    return response


def login_user(email: str, password: str):
    """
    Authenticate a user via Supabase Auth.
    Raises an exception on invalid credentials.
    """
    client = get_supabase()
    response = client.auth.sign_in_with_password(
        {"email": email, "password": password}
    )
    return response


def upsert_profile(user_id: str, name: str, email: str) -> None:
    """
    Insert or update the user's profile row.
    Uses upsert so it's safe to call multiple times (signup + login).
    The DB trigger does this automatically when email confirmation is ON,
    but when it's OFF the trigger may not fire — this is the safety net.
    """
    try:
        client = get_supabase_admin()
        client.table("profiles").upsert(
            {"id": user_id, "name": name, "email": email},
            on_conflict="id",
        ).execute()
    except Exception:
        # Non-fatal — profile may already exist
        pass


def get_user_profile(user_id: str) -> Optional[UserProfile]:
    """Fetch the user's profile from the profiles table."""
    client = get_supabase_admin()
    result = (
        client.table("profiles")
        .select("id, name, email")
        .eq("id", user_id)
        .execute()
    )
    if result.data:
        return UserProfile(**result.data[0])
    return None
