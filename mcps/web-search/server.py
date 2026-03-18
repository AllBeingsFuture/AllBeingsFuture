from __future__ import annotations

import logging
import traceback

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="web-search",
    instructions=(
        "DuckDuckGo based MCP web search server.\n"
        "Available tools: web_search, news_search."
    ),
)


def _format_web_results(results: list[dict]) -> str:
    if not results:
        return "No relevant results found."

    output: list[str] = []
    for index, item in enumerate(results, 1):
        title = item.get("title", "Untitled")
        url = item.get("href", item.get("link", ""))
        body = item.get("body", item.get("snippet", ""))
        output.append(f"**{index}. {title}**\n{url}\n{body}\n")
    return "\n".join(output)


def _format_news_results(results: list[dict]) -> str:
    if not results:
        return "No relevant news found."

    output: list[str] = []
    for index, item in enumerate(results, 1):
        title = item.get("title", "Untitled")
        url = item.get("url", item.get("link", ""))
        body = item.get("body", item.get("excerpt", ""))
        date = item.get("date", "")
        source = item.get("source", "")

        header = f"**{index}. {title}**"
        suffix = " ".join(part for part in (source, date) if part)
        if suffix:
            header += f" ({suffix})"

        output.append(f"{header}\n{url}\n{body}\n")
    return "\n".join(output)


def _require_ddgs():
    try:
        from ddgs import DDGS
    except ImportError:
        raise RuntimeError("Missing dependency: pip install mcp ddgs") from None
    return DDGS


@mcp.tool()
def web_search(
    query: str,
    max_results: int = 5,
    region: str = "wt-wt",
    safesearch: str = "moderate",
) -> str:
    """Search the web using DuckDuckGo."""
    DDGS = _require_ddgs()
    max_results = min(max(1, max_results), 20)

    try:
        with DDGS() as ddgs:
            results = list(
                ddgs.text(
                    query,
                    max_results=max_results,
                    region=region,
                    safesearch=safesearch,
                )
            )
        return _format_web_results(results)
    except Exception as exc:
        logger.error("web_search failed: %s\n%s", exc, traceback.format_exc())
        return f"web_search failed: {type(exc).__name__}: {exc}"


@mcp.tool()
def news_search(
    query: str,
    max_results: int = 5,
    region: str = "wt-wt",
    safesearch: str = "moderate",
    timelimit: str | None = None,
) -> str:
    """Search news using DuckDuckGo."""
    DDGS = _require_ddgs()
    max_results = min(max(1, max_results), 20)

    try:
        with DDGS() as ddgs:
            results = list(
                ddgs.news(
                    query,
                    max_results=max_results,
                    region=region,
                    safesearch=safesearch,
                    timelimit=timelimit,
                )
            )
        return _format_news_results(results)
    except Exception as exc:
        logger.error("news_search failed: %s\n%s", exc, traceback.format_exc())
        return f"news_search failed: {type(exc).__name__}: {exc}"


if __name__ == "__main__":
    mcp.run()
