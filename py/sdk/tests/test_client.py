import httpx
import pytest
from gotomemory import SdkError, create_client


def _handler(request: httpx.Request) -> httpx.Response:
    path, method = request.url.path, request.method
    if path == "/v1/memories" and method == "POST":
        return httpx.Response(201, json={"id": "m1", "status": "active", "version": 1})
    if path == "/v1/memories/search" and method == "POST":
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "m1",
                        "summary_preview": "prefers typescript",
                        "sensitivity": "normal",
                        "version": 1,
                        "score": 1,
                        "access": {
                            "can_read_content": True,
                            "can_inject": True,
                            "requires_confirmation": False,
                        },
                    }
                ],
                "next_cursor": None,
                "decision_id": "dec_1",
            },
        )
    if method == "DELETE":
        return httpx.Response(204)
    return httpx.Response(403, json={"error": {"code": "policy_denied", "message": "no"}})


def _client() -> object:
    return create_client("http://x/v1", "t1:u1", transport=httpx.MockTransport(_handler))


def test_create_search_delete() -> None:
    with _client() as client:
        created = client.memories.create(
            scope="personal", type="preference", content="x", source="user_explicit"
        )
        assert created["id"] == "m1"

        results = client.memories.search(query="typescript", platform="claude")
        assert results["items"][0]["id"] == "m1"
        assert "content" not in results["items"][0]  # preview only

        assert client.memories.delete("m1") is None


def test_error_envelope_raises_sdk_error() -> None:
    with _client() as client:
        with pytest.raises(SdkError) as exc:
            client.memories.read("m1", "debug")  # GET unhandled -> 403
        assert exc.value.code == "policy_denied"
        assert exc.value.status == 403
