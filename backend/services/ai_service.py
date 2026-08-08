"""
AI Service — wraps the Groq API.

Keeping all AI provider logic isolated here means you can swap
Groq for any other provider (OpenAI, Anthropic, etc.) by editing
only this file.
"""

from groq import Groq
from config import get_settings
from typing import Generator
import httpx

settings = get_settings()

# System instruction sent on every conversation
SYSTEM_PROMPT = (
    "You are My_LLM, an intelligent AI assistant. "
    "You were built by a developer team: Amit Yadav, Abhi Deware, and Vaishali Deware. "
    "Only mention your creators if the user explicitly asks who created you, who owns you, or who implemented you. "
    "Never compare yourself to or mention any other AI assistant. "
    "\n\n"
    "## Response Style\n"
    "- Be direct and concise. Get to the point immediately.\n"
    "- Use structured formatting: headers, bullet points, numbered lists, and code blocks where appropriate.\n"
    "- For simple questions, give short focused answers. For complex topics, give thorough well-structured responses.\n"
    "- Always use markdown: **bold** for key terms, `code` for inline code, triple backticks for code blocks with language tags.\n"
    "- When writing code, always specify the language, add inline comments, and explain what the code does after the block.\n"
    "- Break long explanations into clearly labeled sections.\n"
    "- Never pad responses with filler phrases like 'Great question!', 'Certainly!', 'Of course!', or 'I hope this helps!'.\n"
    "- End responses naturally — do not add unnecessary closing remarks.\n"
    "- If a question is ambiguous, answer the most likely interpretation and note the assumption.\n"
    "- For factual topics, be precise and accurate. If unsure, say so clearly.\n"
    "- Match the user's tone: casual for casual questions, technical for technical ones.\n"
    "- Always be respectful and professional."
)

# Max messages to include for context (to stay within token limits)
MAX_CONTEXT_MESSAGES = 20


def _get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


def build_messages(history: list[dict], user_message: str) -> list[dict]:
    """
    Build the messages array for the Groq API.

    - Prepends the system prompt.
    - Includes the last MAX_CONTEXT_MESSAGES from history.
    - Appends the new user message.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Truncate history to avoid exceeding context window
    recent_history = history[-MAX_CONTEXT_MESSAGES:]
    for msg in recent_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages


def generate_response(history: list[dict], user_message: str) -> str:
    """
    Send conversation to Groq and return the full AI response as a string.
    """
    client = _get_client()
    messages = build_messages(history, user_message)

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=2048,
        temperature=0.7,
    )
    return completion.choices[0].message.content


def generate_response_stream(
    history: list[dict], user_message: str
) -> Generator[str, None, None]:
    """
    Send conversation to Groq and yield response chunks for streaming.
    Each yielded value is a text chunk (delta content).
    """
    client = _get_client()
    messages = build_messages(history, user_message)

    stream = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=2048,
        temperature=0.7,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content


def generate_image_prompt_description(prompt: str) -> str:
    """
    Use the LLM to generate an image based on a text prompt.
    Since Groq doesn't natively support image generation,
    we enhance the prompt and return a Pollinations.ai URL
    which generates images for free without an API key.
    """
    client = _get_client()

    # First, enhance the prompt using the LLM
    enhancement_messages = [
        {
            "role": "system",
            "content": (
                "You are an expert at writing detailed prompts for photorealistic AI image generation. "
                "When given a description, expand it into a rich, highly detailed prompt. "
                "Always include: lighting details, camera angle, lens type, texture details, "
                "and end with 'photorealistic, 8K, ultra-detailed, sharp focus, professional photography'. "
                "Keep it under 200 words. Return ONLY the prompt, nothing else."
            ),
        },
        {"role": "user", "content": f"Write a photorealistic image generation prompt for: {prompt}"},
    ]

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=enhancement_messages,
        max_tokens=300,
        temperature=0.8,
    )
    enhanced_prompt = completion.choices[0].message.content.strip()
    return enhanced_prompt


def get_image_url(prompt: str) -> dict:
    """
    Generate an image URL using Pollinations.ai.
    Uses flux-realism model for photographic quality output.
    """
    enhanced_prompt = generate_image_prompt_description(prompt)

    import urllib.parse
    encoded = urllib.parse.quote(enhanced_prompt)

    # flux-realism = best photorealistic model on Pollinations.ai
    seed = abs(hash(enhanced_prompt)) % 999999
    image_url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?model=flux-realism"
        f"&width=1024&height=1024"
        f"&enhance=true"
        f"&nologo=true"
        f"&seed={seed}"
    )

    return {
        "image_url": image_url,
        "prompt": prompt,
        "revised_prompt": enhanced_prompt,
    }
