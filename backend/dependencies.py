"""
Shared FastAPI dependencies — JWT auth guard and admin role check.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.auth_service import verify_token, get_user_profile
from schemas.auth import UserProfile
from database.supabase import get_supabase_admin

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserProfile:
    """
    Dependency that validates the Bearer token and returns the current user.
    Raises HTTP 401 if the token is missing, expired, or invalid.
    """
    token = credentials.credentials
    payload = verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user_profile(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_admin_user(
    current_user: UserProfile = Depends(get_current_user),
) -> UserProfile:
    """
    Dependency that checks whether the current authenticated user is an admin.
    Uses the service-role Supabase client to bypass RLS and query admin_users.
    Raises HTTP 403 if the user is not in the admin_users table.
    """
    client = get_supabase_admin()
    result = (
        client.table("admin_users")
        .select("id")
        .eq("id", current_user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
