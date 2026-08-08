from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from schemas.message import (
    MessageCreate,
    MessageResponse,
    MessagesListResponse,
)
from schemas.auth import UserProfile
from dependencies import get_current_user
from database.supabase import get_supabase_admin
from services.ai_service import generate_response, generate_response_stream
import json

router = APIRouter(tags=["Messages"])

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _verify_conversation_ownership(conversation_id: str, user_id: str) -> dict:
    client = get_supabase_admin()
    result = (
        client.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return result.data[0]


def _get_conversation_history(conversation_id: str) -> list[dict]:
    client = get_supabase_admin()
    result = (
        client.table("messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def _save_message(conversation_id: str, role: str, content: str) -> dict:
    client = get_supabase_admin()
    result = (
        client.table("messages")
        .insert({"conversation_id": conversation_id, "role": role, "content": content})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save message")
    return result.data[0]


def _auto_title_conversation(conversation_id: str, user_id: str, first_message: str):
    client = get_supabase_admin()
    conv = (
        client.table("conversations")
        .select("title")
        .eq("id", conversation_id)
        .execute()
    )
    if conv.data and conv.data[0]["title"] == "New Chat":
        new_title = first_message[:60] + ("..." if len(first_message) > 60 else "")
        client.table("conversations").update({"title": new_title}).eq("id", conversation_id).execute()


# ─────────────────────────────────────────────
# IMPORTANT: Specific sub-routes MUST be declared
# before the generic /{conversation_id}/messages route
# to avoid 405 Method Not Allowed conflicts.
# ─────────────────────────────────────────────

@router.post(
    "/conversations/{conversation_id}/messages/save-user",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_user_message(
    conversation_id: str,
    body: MessageCreate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Save a user message to DB without triggering AI (used for image mode)."""
    _verify_conversation_ownership(conversation_id, current_user.id)
    _auto_title_conversation(conversation_id, current_user.id, body.content)
    return _save_message(conversation_id, "user", body.content)


@router.post(
    "/conversations/{conversation_id}/messages/image",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_image_message(
    conversation_id: str,
    body: MessageCreate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Save an image generation result as an assistant message."""
    _verify_conversation_ownership(conversation_id, current_user.id)

    try:
        parsed = json.loads(body.content)
        title_text = parsed.get("prompt", "Image generation")
    except Exception:
        title_text = "Image generation"

    _auto_title_conversation(conversation_id, current_user.id, title_text)
    return _save_message(conversation_id, "assistant", f"__IMAGE__:{body.content}")


@router.post(
    "/conversations/{conversation_id}/messages/stream",
)
def send_message_stream(
    conversation_id: str,
    body: MessageCreate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Send a user message and stream the AI response back using SSE."""
    _verify_conversation_ownership(conversation_id, current_user.id)

    history = _get_conversation_history(conversation_id)
    _save_message(conversation_id, "user", body.content)
    _auto_title_conversation(conversation_id, current_user.id, body.content)

    full_response = []

    def event_generator():
        try:
            for chunk in generate_response_stream(history, body.content):
                full_response.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            complete_response = "".join(full_response)
            if complete_response:
                _save_message(conversation_id, "assistant", complete_response)

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    conversation_id: str,
    body: MessageCreate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Send a user message and get a full (non-streaming) AI response."""
    _verify_conversation_ownership(conversation_id, current_user.id)

    history = _get_conversation_history(conversation_id)
    _save_message(conversation_id, "user", body.content)
    _auto_title_conversation(conversation_id, current_user.id, body.content)

    ai_content = generate_response(history, body.content)
    return _save_message(conversation_id, "assistant", ai_content)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessagesListResponse,
)
def get_messages(
    conversation_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Return all messages in a conversation."""
    _verify_conversation_ownership(conversation_id, current_user.id)

    client = get_supabase_admin()
    result = (
        client.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    messages = result.data or []
    return MessagesListResponse(messages=messages, total=len(messages))
