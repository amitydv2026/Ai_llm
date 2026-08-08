from fastapi import APIRouter, Depends, HTTPException, status
from schemas.message import AIGenerateRequest, AIImageRequest, AIImageResponse
from schemas.auth import UserProfile
from dependencies import get_current_user
from services.ai_service import generate_response, get_image_url

router = APIRouter(prefix="/ai", tags=["AI"])


@router.post("/generate")
def ai_generate(
    body: AIGenerateRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Standalone AI generation endpoint (no conversation persistence).
    Useful for one-off generations without saving to a conversation.
    """
    try:
        response = generate_response([], body.prompt)
        return {"response": response, "prompt": body.prompt}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )


@router.post("/image", response_model=AIImageResponse)
def ai_image(
    body: AIImageRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Generate an image based on a text prompt.
    Uses Pollinations.ai (free, no extra API key needed).
    The LLM enhances the prompt before passing it to the image service.
    """
    try:
        result = get_image_url(body.prompt)
        return AIImageResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image generation failed: {str(e)}",
        )
