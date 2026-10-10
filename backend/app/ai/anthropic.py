"""Anthropic Messages API provider, called over HTTPS with httpx.

The API key is read from settings on the server and sent only to the Anthropic API.
"""

import httpx

from app.ai.base import LLMRequest, ProviderAuthError, ProviderError

API_VERSION = "2023-06-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.anthropic.com",
        timeout: float = 60.0,
        client: httpx.Client | None = None,
    ):
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for the anthropic provider")
        self.model = model
        self._url = base_url.rstrip("/") + "/v1/messages"
        self._headers = {
            "x-api-key": api_key,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
        }
        self._client = client or httpx.Client(timeout=timeout)

    def complete(self, request: LLMRequest) -> str:
        body = {
            "model": self.model,
            "max_tokens": request.max_tokens,
            "system": request.system,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        try:
            resp = self._client.post(self._url, json=body, headers=self._headers)
        except httpx.TimeoutException as exc:
            raise ProviderError(f"request to Anthropic timed out: {exc}", retryable=True) from exc
        except httpx.TransportError as exc:
            raise ProviderError(f"could not reach Anthropic: {exc}", retryable=True) from exc

        if resp.status_code in (401, 403):
            raise ProviderAuthError(f"Anthropic returned HTTP {resp.status_code}")
        if resp.status_code == 429 or resp.status_code >= 500:
            raise ProviderError(f"Anthropic returned HTTP {resp.status_code}", retryable=True)
        if resp.status_code >= 400:
            raise ProviderError(
                f"Anthropic returned HTTP {resp.status_code}: {_error_message(resp)}", retryable=False
            )

        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderError("Anthropic returned a non-JSON response", retryable=True) from exc
        text = "".join(
            block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
        )
        if not text.strip():
            raise ProviderError("Anthropic returned an empty reply", retryable=True)
        return text


def _error_message(resp: httpx.Response) -> str:
    try:
        return resp.json()["error"]["message"]
    except Exception:
        return resp.text[:200]
