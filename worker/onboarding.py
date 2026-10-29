"""Vivereply onboarding ingestion worker (Modal).

Deployed separately from the Next.js app (see README.md in this folder).
Owns fetch, parse, chunk, embed, and store: chunks land in Supabase tagged
(propertyId, source, indexed=false) and flip visible on clean completion,
while the app keeps budget authority via {stop} callback replies.

Lock-in discipline: every pipeline stage below is a plain function taking
explicit args — Modal is only the wrapper at the bottom (~15 lines), and a
LOCAL_RUN entrypoint exercises the same code without Modal. Auth is a
shared secret compared timing-safe; it arrives in the payload (never
logged, never printed) because arbitrary web-endpoint header injection is
not relied upon — treat Modal dashboard input visibility as trusted crew.

SSRF is the critical gate: EVERY fetch goes through guarded_get(), which
allows public IPs only, re-validates each redirect hop, and caps bytes.
"""

# Deferred annotations: `list | None` syntax imports on older local Pythons
# (3.9) that only collect the Modal app definition; remote runs 3.11.
from __future__ import annotations

import ipaddress
import os
import re
import socket
import sys
import urllib.robotparser as robotparser
import xml.etree.ElementTree as ET
from collections import deque
from urllib.parse import urljoin, urlparse

import httpx

try:
    import modal

    HAVE_MODAL = True
except ImportError:  # LOCAL_RUN without Modal installed
    modal = None  # type: ignore
    HAVE_MODAL = False

WORKER_VERSION = "2"

BUDGET = {
    "max_pages": 50,
    "max_chars": 200_000,
    "max_wellknown_bytes": 2 * 1024 * 1024,
    "max_page_bytes": 2 * 1024 * 1024,
    "max_raw_bundle_bytes": 5 * 1024 * 1024,
    "chunk_chars": 2000,  # ~500 tokens
    "chunk_overlap": 200,
    "embed_batch": 100,
    "fetch_timeout": 15,
    "max_redirects": 5,
}

# ---------------------------------------------------------------- guards ---


class BlockedError(Exception):
    """Raised when a URL fails the SSRF policy. Message states the reason."""


def check_ip(ip_str: str) -> None:
    """Allow globally routable addresses ONLY. Everything else — private,
    loopback, link-local (incl. cloud metadata 169.254/16), multicast,
    reserved, unspecified — raises. This single rule is the whole policy."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        raise BlockedError(f"unresolvable address: {ip_str}")
    if ip.is_multicast or not ip.is_global:
        raise BlockedError(f"non-public address blocked: {ip_str}")


def validate_url(url: str) -> "urlparse":
    """Scheme http(s) only, ports 80/443 only, hostname required. DNS + IP
    checks happen per request in guarded_get (each redirect hop too)."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise BlockedError(f"malformed URL: {url[:80]}")
    if parsed.scheme not in ("http", "https"):
        raise BlockedError(f"scheme blocked: {parsed.scheme or '(none)'}")
    if not parsed.hostname:
        raise BlockedError("URL has no hostname")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in (80, 443):
        raise BlockedError(f"port blocked: {port}")
    return parsed


def resolve_and_check(hostname: str) -> None:
    """Resolve and check EVERY returned address. Best-effort against DNS
    rebinding (a hostile resolver could still rotate answers between this
    check and connect — full pinning would need a custom transport, noted
    as a future hardening, not today's threat model)."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise BlockedError(f"DNS failed: {hostname}")
    if not infos:
        raise BlockedError(f"DNS empty: {hostname}")
    for info in infos:
        check_ip(info[4][0])


def guarded_get(client: httpx.Client, url: str, max_bytes: int) -> httpx.Response:
    """Fetch with the full SSRF policy. Redirects are followed manually so
    each hop is re-validated (no redirect-to-private escape)."""
    current = url
    for _ in range(BUDGET["max_redirects"] + 1):
        parsed = validate_url(current)
        assert parsed.hostname
        resolve_and_check(parsed.hostname)
        res = client.get(current, timeout=BUDGET["fetch_timeout"], follow_redirects=False)
        if res.status_code in (301, 302, 303, 307, 308):
            location = res.headers.get("location")
            if not location:
                raise BlockedError("redirect without location")
            current = urljoin(current, location)
            continue
        if len(res.content) > max_bytes:
            raise BlockedError(f"response over {max_bytes} bytes")
        return res
    raise BlockedError("too many redirects")


# --------------------------------------------------------------- stages ---


def fetch_wellknown(client: httpx.Client, website: str) -> list | None:
    """Our fixed machine endpoint. Any miss returns None → crawl fallback."""
    try:
        parsed = validate_url(website)
        assert parsed.hostname
        url = f"{parsed.scheme}://{parsed.hostname}/.well-known/vivereply-knowledge.json"
        res = guarded_get(client, url, BUDGET["max_wellknown_bytes"])
        if res.status_code != 200:
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

    parsed = validate_url(website)
    assert parsed.hostname
    origin = f"{parsed.scheme}://{parsed.hostname}"
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
        sm = guarded_get(client, urljoin(origin, "/sitemap.xml"), BUDGET["max_page_bytes"])
        if sm.status_code == 200:
            root = ET.fromstring(sm.content)
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
            res = guarded_get(client, url, BUDGET["max_page_bytes"])
            if res.status_code != 200:
                continue
            text = trafilatura.extract(res.text, include_comments=False) or ""
            if len(text.strip()) < 200:
                continue
            stats["chars_seen"] = stats.get("chars_seen", 0) + len(text)
            soup = BeautifulSoup(res.text, "html.parser")
            title = soup.title.string.strip()[:200] if soup.title and soup.title.string else url
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


def parse_upload(client: httpx.Client, download_url: str, filename: str, storage_host: str) -> tuple[str, str]:
    """Download one staged file and return (title, text). The URL host must
    be our own Storage host — never an arbitrary tenant URL."""
    parsed = validate_url(download_url)
    if (parsed.hostname or "") != storage_host:
        raise BlockedError("upload URL host is not our storage")
    res = guarded_get(client, download_url, 25 * 1024 * 1024)
    res.raise_for_status()
    raw, lower = res.content, filename.lower()
    title = filename.rsplit("/", 1)[-1]
    if lower.endswith((".txt", ".md", ".markdown", ".csv")):
        return title, raw.decode("utf-8", errors="replace")
    if lower.endswith(".pdf"):
        from pypdf import PdfReader

        import io

        reader = PdfReader(io.BytesIO(raw))
        return title, "\n".join((page.extract_text() or "") for page in reader.pages)
    if lower.endswith(".docx"):
        import docx
        import io

        doc = docx.Document(io.BytesIO(raw))
        return title, "\n".join(p.text for p in doc.paragraphs)
    if lower.endswith((".xlsx", ".xls")):
        import io

        import pandas as pd

        frames = pd.read_excel(io.BytesIO(raw), sheet_name=None)
        parts = [f"## {name}\n{table.to_csv(index=False)}" for name, table in frames.items()]
        return title, "\n".join(parts)
    raise ValueError(f"unsupported extension: {filename}")


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


def embed_texts(client: httpx.Client, texts: list, gemini_key: str) -> list:
    """Gemini batch embeddings, same model + 768 dims as the app seed path.
    Order preserved; every vector validated before return."""
    vectors: list = []
    for i in range(0, len(texts), BUDGET["embed_batch"]):
        batch = texts[i : i + BUDGET["embed_batch"]]
        res = client.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
            headers={"Content-Type": "application/json", "x-goog-api-key": gemini_key},
            json={
                "requests": [
                    {
                        "model": "models/gemini-embedding-001",
                        "content": {"parts": [{"text": t}]},
                        "taskType": "RETRIEVAL_DOCUMENT",
                        "outputDimensionality": 768,
                    }
                    for t in batch
                ]
            },
            timeout=120,
        )
        res.raise_for_status()
        items = res.json().get("embeddings")
        if not isinstance(items, list) or len(items) != len(batch):
            raise RuntimeError("gemini batch count mismatch")
        for item in items:
            values = item.get("values")
            if not isinstance(values, list) or len(values) != 768:
                raise RuntimeError("gemini vector is not 768 numbers")
            vectors.append(values)
    return vectors


def vector_literal(values: list) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def insert_chunk(cur, job_property_id: str, document_id: str, content: str, vector: list) -> None:
    """The ONLY chunk-write path. Fail-closed twice: no job property id
    raises, and the target document's own propertyId is re-read and must
    equal the job's — a wrong-document bug raises instead of leaking.
    Defense-in-depth with the least-privilege DB role (see
    docs/worker-db-role.sql)."""
    import uuid

    if not job_property_id or not isinstance(job_property_id, str):
        raise RuntimeError("refusing chunk insert without a job property id")
    cur.execute('SELECT "propertyId" FROM "KnowledgeDocument" WHERE "id" = %s', (document_id,))
    row = cur.fetchone()
    if not row or row[0] != job_property_id:
        raise RuntimeError("refusing chunk insert: document is not this job's property")
    cur.execute(
        'INSERT INTO "KnowledgeChunk" ("id", "documentId", "content", "indexed", "embedding", "createdAt")'
        " VALUES (%s, %s, %s, false, %s::vector, NOW())",
        (str(uuid.uuid4()), document_id, content, vector_literal(vector)),
    )


# ------------------------------------------------------------------ run ---


def run_ingestion(payload: dict, env: dict) -> dict:
    """Plain-function pipeline (Modal calls this; LOCAL_RUN too). Returns a
    small result dict; terminal state always lands via app callback."""

    def callback(body: dict) -> bool:
        with httpx.Client(timeout=30) as http:
            res = http.post(
                env["APP_BASE_URL"].rstrip("/") + "/api/worker/callback",
                json=body,
                headers={"Authorization": f"Bearer {env['WORKER_SHARED_SECRET']}"},
            )
            res.raise_for_status()
            return bool(res.json().get("stop", False))

    # Auth first, nothing logged: timing-safe compare against the secret.
    import hmac

    presented = str(payload.get("auth", ""))
    expected = env.get("WORKER_SHARED_SECRET", "")
    if not expected or not hmac.compare_digest(presented, expected):
        return {"accepted": False, "error": "bad auth"}
    if payload.get("version", "1") != WORKER_VERSION:
        return {"accepted": False, "error": "worker version mismatch"}

    run_id = payload["runId"]
    property_id = payload["propertyId"]
    website = payload.get("website")
    files = payload.get("files", [])
    storage_host = payload.get("storageHost", "")
    raw_upload_url = payload.get("rawUploadUrl")
    stats: dict = {"pages_visited": 0, "chars_seen": 0, "docs_parsed": 0, "chunks_written": 0}

    import psycopg

    try:
        if callback({"runId": run_id, "type": "progress", "stats": stats}):
            return {"accepted": True, "stopped": True}
        documents: list = []
        truncated = False
        with httpx.Client(
            timeout=BUDGET["fetch_timeout"],
            follow_redirects=False,
            headers={"User-Agent": "VivereplyBot/1 (+https://app.vivereply.com)"},
        ) as client:
            if website:
                api_docs = fetch_wellknown(client, website)
                if api_docs is not None:
                    documents.extend(api_docs)
                else:
                    crawled, truncated = crawl_site(client, website, stats)
                    documents.extend(crawled)
                if callback({"runId": run_id, "type": "progress", "stats": stats}):
                    return {"accepted": True, "stopped": True}
            for item in files:
                try:
                    title, text = parse_upload(client, item["downloadUrl"], item["path"], storage_host)
                except Exception as exc:
                    raise RuntimeError(f"{item.get('path', 'upload')}: {exc}") from exc
                stats["chars_seen"] = stats.get("chars_seen", 0) + len(text)
                stats["docs_parsed"] = stats.get("docs_parsed", 0) + 1
                documents.append({"title": title, "content": text, "source": f"upload:{item['path']}"})
                if stats["chars_seen"] > BUDGET["max_chars"]:
                    truncated = True
                    break
                if callback({"runId": run_id, "type": "progress", "stats": stats}):
                    return {"accepted": True, "stopped": True}

            all_chunks: list = []
            for doc in documents:
                all_chunks.extend(chunk_text(doc["title"], doc["content"], doc["source"]))
                if len(all_chunks) > 2000:
                    truncated = True
                    all_chunks = all_chunks[:2000]
                    break

            vectors = embed_texts(client, [c["content"] for c in all_chunks], env["GEMINI_API_KEY"])
            doc_ids: list = []
            with psycopg.connect(env["WORKER_DB_URL"]) as conn:
                with conn.cursor() as cur:
                    by_doc: dict = {}
                    for chunk, vector in zip(all_chunks, vectors):
                        key = (chunk["title"], chunk["source"])
                        if key not in by_doc:
                            cur.execute(
                                'SELECT "id" FROM "KnowledgeDocument" WHERE "propertyId" = %s AND "title" = %s AND "source" = %s LIMIT 1',
                                (property_id, chunk["title"], chunk["source"]),
                            )
                            row = cur.fetchone()
                            if row:
                                doc_id = row[0]
                            else:
                                import uuid

                                doc_id = str(uuid.uuid4())
                                cur.execute(
                                    'INSERT INTO "KnowledgeDocument" ("id", "propertyId", "title", "source", "content", "createdAt")'
                                    " VALUES (%s, %s, %s, %s, %s, NOW())",
                                    (doc_id, property_id, chunk["title"], chunk["source"], chunk["content"][:2000]),
                                )
                            by_doc[key] = doc_id
                            doc_ids.append(doc_id)
                        insert_chunk(cur, property_id, by_doc[key], chunk["content"], vector)
                        stats["chunks_written"] = stats.get("chunks_written", 0) + 1
                    cur.execute(
                        'UPDATE "KnowledgeChunk" SET "indexed" = true WHERE "documentId" = ANY(%s)',
                        (doc_ids,),
                    )
                conn.commit()

            if raw_upload_url:
                import json as jsonlib

                bundle = jsonlib.dumps({"runId": run_id, "propertyId": property_id, "documents": documents})[: BUDGET["max_raw_bundle_bytes"]]
                try:
                    client.put(raw_upload_url, content=bundle.encode("utf-8"), timeout=60)
                except Exception:
                    stats["rawSkipped"] = True

        callback({"runId": run_id, "type": "complete", "stats": {**stats, "truncated": truncated}})
        return {"accepted": True}
    except Exception as exc:
        try:
            callback({"runId": run_id, "type": "failed", "error": str(exc)[:500]})
        except Exception:
            pass
        return {"accepted": True, "failed": True}


# ---------------------------------------------------------- thin wrapper ---

if HAVE_MODAL:
    app = modal.App("vivereply-onboarding")
    modal_image = modal.Image.debian_slim(python_version="3.11").pip_install(
        "httpx",
        "beautifulsoup4",
        "trafilatura",
        "pypdf",
        "python-docx",
        "openpyxl",
        "pandas",
        "psycopg[binary]",
        "fastapi[standard]",
    )

    @app.function(
        image=modal_image,
        secrets=[modal.Secret.from_name("vivereply-onboarding")],
        timeout=1800,
    )
    @modal.fastapi_endpoint(method="POST")
    def ingest(payload: dict) -> dict:
        return run_ingestion(payload, dict(os.environ))


if __name__ == "__main__" and os.environ.get("LOCAL_RUN") == "1":
    import json as jsonlib

    with open(sys.argv[1]) as handle:
        print(jsonlib.dumps(run_ingestion(jsonlib.load(handle), dict(os.environ))))
