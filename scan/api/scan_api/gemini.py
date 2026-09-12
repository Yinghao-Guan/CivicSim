"""The one Gemini endpoint every model call here goes through.

REST `generateContent` over httpx, rather than an SDK, so the only moving part
is one documented endpoint.
"""

import base64
import os

import httpx

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_TIMEOUT = 90.0


class GeminiUnavailable(RuntimeError):
    """No API key is configured."""


class GeminiFailed(RuntimeError):
    """The call failed or returned something unusable."""


def is_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def image_part(data: bytes, mime_type: str = "image/jpeg") -> dict:
    return {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(data).decode("ascii")}}


def generate(
    model: str,
    parts: list[dict],
    generation_config: dict,
    client: httpx.Client | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiUnavailable("GEMINI_API_KEY is not set for the scan API.")

    http = client or httpx.Client(timeout=timeout)
    try:
        response = http.post(
            ENDPOINT.format(model=model),
            headers={"x-goog-api-key": api_key},
            json={"contents": [{"role": "user", "parts": parts}], "generationConfig": generation_config},
        )
    except httpx.HTTPError as exc:
        raise GeminiFailed(f"Could not reach Gemini: {exc}") from exc
    finally:
        if client is None:
            http.close()

    if response.status_code != 200:
        raise GeminiFailed(f"Gemini returned {response.status_code}: {_error_message(response)}")
    return response.json()


def response_parts(payload: dict) -> list[dict]:
    try:
        return payload["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError) as exc:
        reason = payload.get("promptFeedback", {}).get("blockReason") if isinstance(payload, dict) else None
        raise GeminiFailed(
            f"Gemini returned no usable answer{f' (blocked: {reason})' if reason else ''}."
        ) from exc


def response_text(payload: dict) -> str:
    return "".join(p.get("text", "") for p in response_parts(payload) if not p.get("thought"))


def response_image(payload: dict) -> tuple[bytes, str]:
    for part in response_parts(payload):
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
            return base64.b64decode(inline["data"]), mime
    raise GeminiFailed("Gemini returned no image.")


def _error_message(response: httpx.Response) -> str:
    try:
        return response.json()["error"]["message"]
    except Exception:
        return response.text[:200]
