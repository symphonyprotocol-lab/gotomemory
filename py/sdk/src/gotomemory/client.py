"""Typed-ish httpx client for the gotomemory Gateway. Mirrors the TypeScript SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class SdkError(Exception):
    """Carries the unified error-envelope code (system spec §9.8)."""

    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status = status


def _unwrap(resp: httpx.Response) -> Any:
    if resp.is_success:
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()
    try:
        err = resp.json().get("error", {})
        code = err.get("code", "internal")
        message = err.get("message", "request failed")
    except Exception:
        code, message = "internal", resp.text or "request failed"
    raise SdkError(code, message, resp.status_code)


class _Memories:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def create(self, **body: Any) -> dict[str, Any]:
        return _unwrap(self._http.post("/memories", json=body))

    def search(self, **body: Any) -> dict[str, Any]:
        return _unwrap(self._http.post("/memories/search", json=body))

    def read(self, memory_id: str, purpose: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"/memories/{memory_id}", params={"purpose": purpose}))

    def update(self, memory_id: str, **body: Any) -> dict[str, Any]:
        return _unwrap(self._http.patch(f"/memories/{memory_id}", json=body))

    def delete(self, memory_id: str) -> None:
        _unwrap(self._http.request("DELETE", f"/memories/{memory_id}"))


class _Context:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def build(self, **body: Any) -> dict[str, Any]:
        return _unwrap(self._http.post("/context/build", json=body))

    def confirm(self, **body: Any) -> dict[str, Any]:
        return _unwrap(self._http.post("/context/confirm", json=body))


@dataclass
class GotomemoryClient:
    memories: _Memories
    context: _Context
    _http: httpx.Client

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> GotomemoryClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


def create_client(
    base_url: str,
    token: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> GotomemoryClient:
    """Create a client. `transport` lets tests inject httpx.MockTransport."""
    http = httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        transport=transport,
    )
    return GotomemoryClient(_Memories(http), _Context(http), http)
