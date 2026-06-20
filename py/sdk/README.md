# gotomemory (Python SDK)

Python client for the gotomemory Gateway API (system spec §16.3). Mirrors the TypeScript
SDK and targets the same OpenAPI contract (`packages/contracts/openapi/openapi.yaml`); a
production build can regenerate the typed models with `openapi-python-client` (monorepo
guide §17.5).

```python
from gotomemory import create_client

with create_client("http://localhost:8787/v1", token="t1:u1") as client:
    created = client.memories.create(
        scope="personal", type="preference",
        content="prefers TypeScript", source="user_explicit",
    )
    results = client.memories.search(query="typescript", platform="claude")
    ctx = client.context.build(task="write code", platform="claude", client_id="py-sdk")
```
