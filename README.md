# My_LLM — AI Content Generator

A full-stack AI chat application built with HTML/CSS/JS frontend, FastAPI backend, Supabase database, and Groq LLM API.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** FastAPI (Python)
- **Database:** Supabase (PostgreSQL)
- **AI:** Groq API (LLaMA / Mixtral models)

## Features

- User signup and login
- ChatGPT-style chat interface
- Multi-turn conversation with context
- Conversation history sidebar
- Rename and delete conversations
- Streaming AI responses
- Image generation via prompt
- Fully responsive (desktop, tablet, mobile)
- Secure: API keys never exposed to frontend

## Project Structure

```
ai-content-generator/
├── frontend/
│   ├── index.html          # Main chat page
│   ├── login.html          # Login page
│   ├── signup.html         # Signup page
│   ├── css/
│   │   ├── style.css       # Global styles
│   │   ├── chat.css        # Chat layout styles
│   │   └── responsive.css  # Responsive breakpoints
│   └── js/
│       ├── auth.js         # Auth logic
│       ├── chat.js         # Chat logic
│       ├── api.js          # API calls
│       └── ui.js           # UI helpers
├── backend/
│   ├── main.py             # FastAPI app entry point
│   ├── config.py           # Configuration
│   ├── routes/
│   │   ├── auth.py
│   │   ├── conversations.py
│   │   └── messages.py
│   ├── services/
│   │   ├── ai_service.py
│   │   └── auth_service.py
│   ├── database/
│   │   └── supabase.py
│   └── schemas/
│       ├── auth.py
│       ├── conversation.py
│       └── message.py
├── .env.example
├── .gitignore
└── README.md
```

## Setup Instructions

### 1. Clone and install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
GROQ_API_KEY=your_groq_api_key
SECRET_KEY=your_jwt_secret_key
```

### 3. Set up Supabase database

Run the SQL in `backend/database/schema.sql` in your Supabase SQL editor.

### 4. Run the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 5. Open the frontend

Open `frontend/index.html` in your browser, or serve it with a static server.

## API Endpoints

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET  /auth/me`

### Conversations
- `POST   /conversations`
- `GET    /conversations`
- `GET    /conversations/{id}`
- `PATCH  /conversations/{id}`
- `DELETE /conversations/{id}`

### Messages
- `POST /conversations/{id}/messages`
- `GET  /conversations/{id}/messages`

### AI
- `POST /ai/generate`
- `POST /ai/image`
