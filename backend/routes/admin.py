"""
Admin Routes — only accessible with hardcoded admin credentials.
Admin can view all users, conversations, messages, and stats.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database.supabase import get_supabase_admin
from jose import jwt, JWTError
from config import get_settings
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/admin", tags=["Admin"])
bearer_scheme = HTTPBearer()
settings = get_settings()

# ─── Hardcoded admin credentials ───────────────
ADMIN_EMAIL    = "yamitnitian2022@gmail.com"
ADMIN_PASSWORD = "Amit1212@"
ADMIN_TOKEN_SUBJECT = "admin_superuser"


def _create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode(
        {"sub": ADMIN_TOKEN_SUBJECT, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _verify_admin_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        if payload.get("sub") != ADMIN_TOKEN_SUBJECT:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an admin token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired admin token")
    return True


# ─────────────────────────────────────────────
# Admin Login
# ─────────────────────────────────────────────

class AdminLoginRequest:
    pass

from pydantic import BaseModel

class AdminLogin(BaseModel):
    email: str
    password: str


@router.post("/login")
def admin_login(body: AdminLogin):
    """Validate hardcoded admin credentials and return admin JWT."""
    if body.email != ADMIN_EMAIL or body.password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )
    token = _create_admin_token()
    return {"access_token": token, "token_type": "bearer", "role": "admin"}


# ─────────────────────────────────────────────
# Dashboard Stats
# ─────────────────────────────────────────────

@router.get("/stats")
def admin_stats(_: bool = Depends(_verify_admin_token)):
    """Return high-level counts: users, conversations, messages."""
    client = get_supabase_admin()

    users  = client.table("profiles").select("id", count="exact").execute()
    convs  = client.table("conversations").select("id", count="exact").execute()
    msgs   = client.table("messages").select("id", count="exact").execute()

    # Count image messages
    imgs = client.table("messages").select("id", count="exact").like("content", "__IMAGE__%").execute()

    # New users today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_today = client.table("profiles").select("id", count="exact").gte("created_at", today).execute()

    return {
        "total_users":         users.count or 0,
        "total_conversations": convs.count or 0,
        "total_messages":      msgs.count or 0,
        "total_images":        imgs.count or 0,
        "new_users_today":     new_today.count or 0,
    }


# ─────────────────────────────────────────────
# All Users
# ─────────────────────────────────────────────

@router.get("/users")
def admin_get_users(_: bool = Depends(_verify_admin_token)):
    """Return all registered users with conversation + message counts."""
    client = get_supabase_admin()

    users = client.table("profiles").select("*").order("created_at", desc=True).execute()
    result = []

    for user in (users.data or []):
        uid = user["id"]

        conv_count = client.table("conversations").select("id", count="exact").eq("user_id", uid).execute()
        msg_count  = client.table("messages").select("m:id", count="exact").execute()

        # Get last activity (latest conversation updated_at)
        last_conv = (
            client.table("conversations")
            .select("updated_at")
            .eq("user_id", uid)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        last_active = last_conv.data[0]["updated_at"] if last_conv.data else None

        result.append({
            **user,
            "conversation_count": conv_count.count or 0,
            "last_active": last_active,
        })

    return {"users": result, "total": len(result)}


# ─────────────────────────────────────────────
# Single User Detail
# ─────────────────────────────────────────────

@router.get("/users/{user_id}")
def admin_get_user(user_id: str, _: bool = Depends(_verify_admin_token)):
    """Return full detail for one user: profile + all conversations."""
    client = get_supabase_admin()

    profile = client.table("profiles").select("*").eq("id", user_id).execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="User not found")

    convs = (
        client.table("conversations")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )

    return {
        "profile": profile.data[0],
        "conversations": convs.data or [],
    }


# ─────────────────────────────────────────────
# Conversation Messages (admin view)
# ─────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages")
def admin_get_messages(conversation_id: str, _: bool = Depends(_verify_admin_token)):
    """Return all messages in any conversation."""
    client = get_supabase_admin()

    msgs = (
        client.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {"messages": msgs.data or [], "total": len(msgs.data or [])}


# ─────────────────────────────────────────────
# Delete User (admin action)
# ─────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(user_id: str, _: bool = Depends(_verify_admin_token)):
    """Permanently delete a user and all their data."""
    client = get_supabase_admin()

    # Delete messages → conversations → profile (cascade order)
    convs = client.table("conversations").select("id").eq("user_id", user_id).execute()
    for conv in (convs.data or []):
        client.table("messages").delete().eq("conversation_id", conv["id"]).execute()

    client.table("conversations").delete().eq("user_id", user_id).execute()
    client.table("profiles").delete().eq("id", user_id).execute()


# ─────────────────────────────────────────────
# Recent Activity Feed
# ─────────────────────────────────────────────

@router.get("/activity")
def admin_activity(_: bool = Depends(_verify_admin_token)):
    """Return the 50 most recent messages across all users."""
    client = get_supabase_admin()

    msgs = (
        client.table("messages")
        .select("id, conversation_id, role, content, created_at, conversations(user_id, title, profiles(name, email))")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    return {"activity": msgs.data or []}
