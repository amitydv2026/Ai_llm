from fastapi import APIRouter, HTTPException, status, Depends
from schemas.auth import SignupRequest, LoginRequest, AuthResponse, UserProfile
from services.auth_service import signup_user, login_user, create_access_token, upsert_profile
from dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _parse_supabase_error(e: Exception) -> str:
    """
    Extract a human-readable message from Supabase exceptions.
    Supabase wraps errors in different ways depending on the version.
    """
    msg = str(e).lower()

    if "rate limit" in msg or "email rate" in msg:
        return "Signup limit reached for this email provider. Please use a different email address (Gmail, Outlook, etc.) or wait 1 hour."
    if "user already registered" in msg or "already been registered" in msg:
        return "An account with this email already exists. Please sign in."
    if "invalid login credentials" in msg or "invalid email or password" in msg:
        return "Incorrect email or password."
    if "email not confirmed" in msg:
        return "Please confirm your email before signing in. Check your inbox."
    if "password should be" in msg or "weak password" in msg:
        return "Password is too weak. Use at least 8 characters."
    if "unable to validate" in msg:
        return "Session expired. Please sign in again."

    # Return raw message for anything else (helps during development)
    return str(e)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest):
    """Register a new user account."""
    try:
        response = signup_user(body.name, body.email, body.password)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_parse_supabase_error(e),
        )

    if not response.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup failed. Please try again.",
        )

    user_id = str(response.user.id)

    # Manually upsert the profile in case the DB trigger didn't fire
    # (happens when email confirmation is disabled)
    upsert_profile(user_id, body.name, body.email)

    # If email confirmation is OFF in Supabase, a session is returned immediately
    # — log the user in right away
    if response.session:
        token = create_access_token(data={"sub": user_id})
        return AuthResponse(
            message="Account created successfully.",
            user=UserProfile(id=user_id, name=body.name, email=body.email),
            access_token=token,
        )

    # Email confirmation is ON — user needs to confirm before logging in
    return AuthResponse(
        message="Account created! Check your email to confirm your account, then sign in.",
        user=UserProfile(id=user_id, name=body.name, email=body.email),
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    """Authenticate and receive an access token."""
    try:
        response = login_user(body.email, body.password)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_parse_supabase_error(e),
        )

    if not response.user or not response.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login failed. Please check your credentials.",
        )

    user = response.user
    user_id = str(user.id)
    name = user.user_metadata.get("name", user.email.split("@")[0]) if user.user_metadata else user.email.split("@")[0]

    # Ensure profile exists (safety net)
    upsert_profile(user_id, name, user.email)

    # Issue our own JWT
    token = create_access_token(data={"sub": user_id})

    return AuthResponse(
        message="Login successful",
        user=UserProfile(id=user_id, name=name, email=user.email),
        access_token=token,
    )


@router.post("/logout")
def logout(current_user: UserProfile = Depends(get_current_user)):
    """Logout — client should discard the token."""
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserProfile)
def get_me(current_user: UserProfile = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user
