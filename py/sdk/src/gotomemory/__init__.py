"""Python SDK for the gotomemory Gateway API (system spec §16.3)."""

from .client import GotomemoryClient, SdkError, create_client

__all__ = ["GotomemoryClient", "SdkError", "create_client"]
