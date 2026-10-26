from __future__ import annotations

import httpx2

_HTTP_POOL = httpx2.AsyncHTTPTransport(
    http2=True,
    limits=httpx2.Limits(
        max_connections=100,
        max_keepalive_connections=20,
        keepalive_expiry=30,
    ),
)


class _SharedPool(httpx2.AsyncBaseTransport):
    """Let run-scoped clients borrow the process-wide connection pool."""

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        """Delegate requests without transferring ownership of the pool."""
        return await _HTTP_POOL.handle_async_request(request)

    async def aclose(self) -> None:
        """Leave closing the shared pool to the Aegra application lifespan."""


def http_client_factory(
    headers: dict[str, str] | None = None,
    timeout: httpx2.Timeout | None = None,
    auth: httpx2.Auth | None = None,
    follow_redirects: bool = False,
) -> httpx2.AsyncClient:
    """Create a run-scoped client that borrows the worker-wide pool."""
    if timeout is None:
        timeout = httpx2.Timeout(30.0, read=300.0)

    return httpx2.AsyncClient(
        auth=auth,
        headers=headers,
        timeout=timeout,
        follow_redirects=follow_redirects,
        transport=_SharedPool(),
    )


async def close_shared_mcp_resources() -> None:
    """Close the worker-wide HTTP pool during Aegra shutdown."""
    await _HTTP_POOL.aclose()
