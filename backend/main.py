"""
My_LLM — FastAPI Backend Entry Point
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging

from routes import auth, conversations, messages, ai

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("my_llm")

# ─────────────────────────────────────────────
# App
# ─────────────────────────────────────────────
app = FastAPI(
    title="My_LLM API",
    description="Backend API for My_LLM — an AI content generator.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # GitHub Pages — replace YOUR_USERNAME with your GitHub username
        "https://YOUR_USERNAME.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ─────────────────────────────────────────────
# Global exception handler
# ─────────────────────────────────────────────
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )

# ─────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(ai.router)

# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    """Simple health-check endpoint for monitoring."""
    return {"status": "ok", "app": "My_LLM"}


@app.get("/", tags=["Health"])
def root():
    return {"message": "Welcome to My_LLM API. Visit /docs for documentation."}


# ─────────────────────────────────────────────
# Serve Frontend (Option 3)
# Mounts the frontend/ folder so the entire app
# is accessible from a single uvicorn process.
#
# Pages:
#   http://localhost:8000/app          → chat
#   http://localhost:8000/app/login    → login
#   http://localhost:8000/app/signup   → signup
# ─────────────────────────────────────────────
_FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if _FRONTEND_DIR.exists():
    # Serve static assets (css/, js/)
    app.mount("/app/css", StaticFiles(directory=str(_FRONTEND_DIR / "css")), name="css")
    app.mount("/app/js",  StaticFiles(directory=str(_FRONTEND_DIR / "js")),  name="js")

    @app.get("/app", include_in_schema=False)
    @app.get("/app/", include_in_schema=False)
    def serve_index():
        return FileResponse(str(_FRONTEND_DIR / "index.html"))

    @app.get("/app/login", include_in_schema=False)
    def serve_login():
        return FileResponse(str(_FRONTEND_DIR / "login.html"))

    @app.get("/app/signup", include_in_schema=False)
    def serve_signup():
        return FileResponse(str(_FRONTEND_DIR / "signup.html"))
