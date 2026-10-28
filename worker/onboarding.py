"""Vivereply onboarding ingestion worker (Modal).

Deployed separately from the Next.js app (see README.md in this folder).
Owns crawling, parsing, and chunking only — budgets are enforced here AND
in the app callback, while keys, embeddings, and the database stay in the
app. Reports progress in signed callbacks; stops the moment the app
answers {"stop": true} (budget trip or terminal run).

Invoke shape (Bearer $WORKER_SHARED_SECRET):
  POST {webhook} { runId, propertyId, website?, files: [{ path, downloadUrl }] }
"""

import io
import re
import time
import urllib.robotparser as robotparser
import xml.etree.ElementTree as ET
from collections import deque
from urllib.parse import urljoin, urlparse

import httpx
import modal

app = modal.App("vivereply-onboarding")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "httpx",
    "beautifulsoup4",
    "trafilatura",
    "pypdf",
    "python-docx",
    "openpyxl",
    "pandas",
)

BUDGET = {
    "max_pages": 50,
    "max_chars": 200_000,
    "max_wellknown_bytes": 2 * 1024 * 1024,
    "max_page_bytes": 2 * 1024 * 1024,
    "chunk_chars": 2000,  # ~500 tokens
    "chunk_overlap": 200,
    "chunks_per_callback": 50,
    "fetch_timeout": 15,
}

WORKER_VERSION = "1"


def _callback_url() -> str:
    import os

    base = os.environ["APP_BASE_URL"].rstrip("/")
    return f"{base}/api/worker/callback"


def _auth() -> dict:
    import os

    return {"Authorization": f"Bearer {os.environ['WORKER_SHARED_SECRET']}"}


def post_callback(payload: dict) -> bool:
    """Returns True when the app says stop."""
    with httpx.Client(timeout=30) as client:
        res = client.post(_callback_url(), json=payload, headers=_auth())
        res.raise_for_status()
        return bool(res.json().get("stop", False))


def chunk_text(title: str, text: str, source: str) -> list:
    text = re.sub(r"\s+", " ", text).strip()
    out, i = [], 0
    size, overlap = BUDGET["chunk_chars"], BUDGET["chunk_overlap"]
    while i < len(text):
        piece = text[i : i + size]
        if len(piece.strip()) > 100:
            out.append({"title": title, "content": piece.strip(), "source": source})
        if i + size >= len(text):
            break
        i += size - overlap
    return out


def fetch_wellknown(client: httpx.Client, website: str) -> list | None:
    """Our fixed machine endpoint. Any miss (network, status, shape, size)
    returns None so the caller falls back to crawling."""
    try:
        parsed = urlparse(website)
        if parsed.scheme not in ("http", "https"):
            return None
        url = f"{parsed.scheme}://{parsed.netloc}/.well-known/vivereply-knowledge.json"
        res = client.get(url, timeout=BUDGET["fetch_timeout"], follow_redirects=True)
        if res.status_code != 200 or len(res.content) > BUDGET["max_wellknown_bytes"]:
            return None
        docs = res.json().get("documents")
        if not isinstance(docs, list):
            return None
        cleaned = []
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            title = str(doc.get("title", "")).strip()[:200]
            content = str(doc.get("content", "")).strip()
            source = str(doc.get("url", "") or url)[:300]
            if title and content:
                cleaned.append({"title": title, "content": content, "source": source})
        return cleaned or None
    except Exception:
        return None


def crawl_site(client: httpx.Client, website: str, stats: dict) -> tuple[list, bool]:
    """Polite same-origin crawl: robots.txt respected, sitemap first, BFS
    capped by page count. Returns (documents, truncated)."""
    import trafilatura
    from bs4 import BeautifulSoup

    parsed = urlparse(website)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    robots = robotparser.RobotFileParser()
    try:
        robots.set_url(urljoin(origin, "/robots.txt"))
        robots.read()
    except Exception:
        pass

    def allowed(url: str) -> bool:
        try:
            return robots.can_fetch("VivereplyBot", url)
        except Exception:
            return True

    queue: deque[str] = deque()
    try:
        sm = client.get(urljoin(origin, "/sitemap.xml"), timeout=BUDGET["fetch_timeout"])
        if sm.status_code == 200:
            root = ET.fromstring(sm.content[: BUDGET["max_page_bytes"]])
            for loc in root.iter():
                if loc.tag.endswith("loc") and loc.text:
                    candidate = loc.text.strip()
                    if candidate.startswith(origin):
                        queue.append(candidate)
    except Exception:
        pass
    queue.appendleft(website)

    seen, docs = set(), []
    while queue and len(seen) < BUDGET["max_pages"]:
        url = queue.popleft()
        if url in seen or not url.startswith(origin) or not allowed(url):
            continue
        seen.add(url)
        try:
            res = client.get(url, timeout=BUDGET["fetch_timeout"], follow_redirects=True)
            if res.status_code != 200 or len(res.content) > BUDGET["max_page_bytes"]:
                continue
            text = trafilatura.extract(res.text, include_comments=False) or ""
            if len(text.strip()) < 200:
                continue
            stats["chars_seen"] = stats.get("chars_seen", 0) + len(text)
            soup = BeautifulSoup(res.text, "html.parser")
            title = (soup.title.string.strip()[:200] if soup.title and soup.title.string else url)
            docs.append({"title": title, "content": text.strip(), "source": url})
            stats["pages_visited"] = stats.get("pages_visited", 0) + 1
            if stats["chars_seen"] > BUDGET["max_chars"]:
                return docs, True
            for anchor in soup.find_all("a", href=True):
                link = urljoin(url, anchor["href"]).split("#")[0]
                if link.startswith(origin) and link not in seen and len(queue) < BUDGET["max_pages"] * 4:
                    queue.append(link)
        except Exception:
            continue
    return docs, len(seen) >= BUDGET["max_pages"]


def parse_upload(client: httpx.Client, download_url: str, filename: str) -> tuple[str, str]:
    """Download one staged file and return (title, text). Raises on any
    failure so the caller records WHICH file failed."""
    res = client.get(download_url, timeout=60, follow_redirects=True)
    res.raise_for_status()
    raw, lower = res.content, filename.lower()
    title = filename.rsplit("/", 1)[-1]
    if lower.endswith((".txt", ".md", ".markdown", ".csv")):
        return title, raw.decode("utf-8", errors="replace")
    if lower.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        return title, "\n".join((page.extract_text() or "") for page in reader.pages)
    if lower.endswith(".docx"):
        import docx

        doc = docx.Document(io.BytesIO(raw))
        return title, "\n".join(p.text for p in doc.paragraphs)
    if lower.endswith((".xlsx", ".xls")):
        import pandas as pd

        frames = pd.read_excel(io.BytesIO(raw), sheet_name=None)
        parts = [f"## {name}\n{table.to_csv(index=False)}" for name, table in frames.items()]
        return title, "\n".join(parts)
    raise ValueError(f"unsupported extension: {filename}")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("vivereply-onboarding")],
    timeout=1800,
)
@modal.web_endpoint(method="POST")
def ingest(payload: dict) -> dict:
    import os

    if payload.get("version", "1") != WORKER_VERSION:
        return {"accepted": False, "error": "worker version mismatch"}
    run_id = payload["runId"]
    website = payload.get("website")
    files = payload.get("files", [])
    stats: dict = {"pages_visited": 0, "chars_seen": 0, "docs_parsed": 0, "chunks_written": 0}

    def progress(extra: dict | None = None) -> bool:
        merged = {**stats, **(extra or {})}
        return post_callback({"runId": run_id, "type": "progress", "stats": merged})

    def flush(chunks: list) -> bool:
        stop = False
        for i in range(0, len(chunks), BUDGET["chunks_per_callback"]):
            batch = chunks[i : i + BUDGET["chunks_per_callback"]]
            stop = post_callback({"runId": run_id, "type": "chunks", "chunks": batch, "stats": stats})
            if stop:
                break
        return stop

    try:
        if progress():
            return {"accepted": True, "stopped": True}
        documents: list = []
        truncated = False
        with httpx.Client(
            timeout=BUDGET["fetch_timeout"],
            follow_redirects=True,
            headers={"User-Agent": "VivereplyBot/1 (+https://app.vivereply.com)"},
        ) as client:
            if website:
                api_docs = fetch_wellknown(client, website)
                if api_docs is not None:
                    documents.extend(api_docs)
                else:
                    crawled, truncated = crawl_site(client, website, stats)
                    documents.extend(crawled)
                if progress():
                    return {"accepted": True, "stopped": True}
            for item in files:
                try:
                    title, text = parse_upload(client, item["downloadUrl"], item["path"])
                except Exception as exc:
                    raise RuntimeError(f"{item.get('path', 'upload')}: {exc}") from exc
                stats["chars_seen"] = stats.get("chars_seen", 0) + len(text)
                stats["docs_parsed"] = stats.get("docs_parsed", 0) + 1
                documents.append({"title": title, "content": text, "source": f"upload:{item['path']}"})
                if stats["chars_seen"] > BUDGET["max_chars"]:
                    truncated = True
                    break
                if progress():
                    return {"accepted": True, "stopped": True}

        all_chunks: list = []
        for doc in documents:
            all_chunks.extend(chunk_text(doc["title"], doc["content"], doc["source"]))
            if len(all_chunks) > 2000:
                truncated = True
                all_chunks = all_chunks[:2000]
                break
        if flush(all_chunks):
            return {"accepted": True, "stopped": True}
        post_callback({"runId": run_id, "type": "complete", "stats": {**stats, "truncated": truncated}})
        return {"accepted": True}
    except Exception as exc:
        post_callback({"runId": run_id, "type": "failed", "error": str(exc)[:500]})
        return {"accepted": True, "failed": True}
