from pydantic import BaseModel, field_validator
from typing import Any


class MessageCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message content cannot be empty")
        # Allow larger content for image payloads (__IMAGE__:{json})
        max_len = 50000 if v.startswith("__IMAGE__:") else 10000
        if len(v) > max_len:
            raise ValueError(f"Message too long (max {max_len} characters)")
        return v


class MessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    conversation_id: str
    role: str    # plain str — no Literal restriction on read
    content: str
    created_at: Any  # accept string or datetime from Supabase


class MessagesListResponse(BaseModel):
    messages: list[MessageResponse]
    total: int


class AIGenerateRequest(BaseModel):
    prompt: str
    conversation_id: str | None = None

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Prompt cannot be empty")
        return v


class AIImageRequest(BaseModel):
    prompt: str

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Prompt cannot be empty")
        return v


class AIImageResponse(BaseModel):
    image_url: str
    prompt: str
    revised_prompt: str | None = None
