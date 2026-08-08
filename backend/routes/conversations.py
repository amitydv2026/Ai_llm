from fastapi import APIRouter, HTTPException, status, Depends
from schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationListResponse,
)
from schemas.auth import UserProfile
from dependencies import get_current_user
from database.supabase import get_supabase_admin

router = APIRouter(prefix="/conversations", tags=["Conversations"])


def _get_conversation_or_404(conversation_id: str, user_id: str) -> dict:
    """Fetch a conversation, ensuring it belongs to the current user."""
    client = get_supabase_admin()
    result = (
        client.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return result.data[0]


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Create a new conversation."""
    client = get_supabase_admin()
    result = (
        client.table("conversations")
        .insert({"user_id": current_user.id, "title": body.title})
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation",
        )
    return result.data[0]


@router.get("", response_model=ConversationListResponse)
def list_conversations(current_user: UserProfile = Depends(get_current_user)):
    """Return all conversations for the current user, ordered by latest first."""
    client = get_supabase_admin()
    result = (
        client.table("conversations")
        .select("*")
        .eq("user_id", current_user.id)
        .order("updated_at", desc=True)
        .execute()
    )
    conversations = result.data or []
    return ConversationListResponse(conversations=conversations, total=len(conversations))


@router.get("/{conversation_id}", response_model=ConversationResponse)
def get_conversation(
    conversation_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Get a single conversation by ID."""
    conversation = _get_conversation_or_404(conversation_id, current_user.id)
    return conversation


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    current_user: UserProfile = Depends(get_current_user),
):
    """Rename a conversation."""
    _get_conversation_or_404(conversation_id, current_user.id)

    client = get_supabase_admin()
    result = (
        client.table("conversations")
        .update({"title": body.title})
        .eq("id", conversation_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update conversation",
        )
    return result.data[0]


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    client = get_supabase_admin()

    # Check ownership first
    result = (
        client.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("user_id", current_user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Delete messages first (in case cascades aren't set up)
    client.table("messages").delete().eq(
        "conversation_id", conversation_id
    ).execute()

    # Delete conversation
    client.table("conversations").delete().eq("id", conversation_id).eq(
        "user_id", current_user.id
    ).execute()
