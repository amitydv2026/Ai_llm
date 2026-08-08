from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ConversationCreate(BaseModel):
    title: str = "New Chat"


class ConversationUpdate(BaseModel):
    title: str

    class Config:
        str_strip_whitespace = True


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int
