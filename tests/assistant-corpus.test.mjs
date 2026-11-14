import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  CURATED_ENTRIES,
  chunkText,
  curatedSourceLabel,
  htmlToText,
} from "@/lib/assistant-corpus";
import {
  DOCS_BASE,
  DOCS_PAGES,
  citationFor,
  ingestAssistantCorpus,
  parseSitemapXml,
} from "@/lib/assistant-ingest";

describe("corpus hygiene (R1)", () => {
  it("contains no internal framing in user-facing text", () => {
    const banned = [/hackathon/i, /\bmvp\b/i, /founder handover/i, /unpublished/i, /TODO/i, /FIXME/i];
    for (const entry of CURATED_ENTRIES) {
      const text = `${entry.title}\n${entry.body}`;
      for (const re of banned) {
        assert.ok(!re.test(text), `${entry.id} matches ${re}`);
      }
    }
  });

  it("covers business, troubleshooting, and subscription groups", () => {
    const groups = new Set(CURATED_ENTRIES.map((e) => e.group));
    assert.deepEqual([...groups].sort(), ["business", "subscription", "troubleshooting"]);
    assert.ok(CURATED_ENTRIES.length >= 10);
  });

  it("cites only docs pages that exist in the published list", () => {
    const pages = new Set(DOCS_PAGES);
    for (const entry of CURATED_ENTRIES) {
      if (!entry.docsUrl) continue;
      assert.ok(entry.docsUrl.startsWith(`${DOCS_BASE}/`), `${entry.id}: ${entry.docsUrl}`);
      const path = entry.docsUrl.slice(`${DOCS_BASE}/`.length);
      assert.ok(pages.has(path), `${entry.id} cites missing page ${path}`);
    }
  });

  it("labels curated citations with user-facing source names", () => {
    assert.equal(curatedSourceLabel("business"), "ViveReply business details");
    assert.equal(curatedSourceLabel("troubleshooting"), "ViveReply troubleshooting");
    assert.equal(curatedSourceLabel("subscription"), "ViveReply subscription help");
  });
});

describe("chunkText (R1)", () => {
  it("packs paragraphs into windows and never drops text", () => {
    const paras = ["First paragraph here.", "Second paragraph here.", "Third paragraph here."];
    const chunks = chunkText(paras.join("\n\n"), 60);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks.join(" ").replace(/\s+/g, " "), paras.join(" "));
  });

  it("keeps an over-long paragraph whole and skips empties", () => {
    assert.deepEqual(chunkText("", 100), []);
    assert.deepEqual(chunkText("   \n\n  ", 100), []);
    const long = "x".repeat(5000);
    assert.deepEqual(chunkText(long, 100), [long]);
  });
});

describe("htmlToText (R1)", () => {
  const FIXTURE = `<!doctype html><html><head><title>Rooms — Docs</title><style>.x{color:red}</style>
    <script>console.log("noise")</script></head><body>
    <nav>Home Settings Logout</nav>
    <main><h1>Managing rooms</h1><p>Add a room from <a href="/rooms">Rooms</a> &amp; save.</p>
    <ul><li>Step one</li><li>Step two</li></ul></main>
    <footer>© 2026 noise</footer></body></html>`;

  it("extracts main text with title, dropping chrome and decoding entities", () => {
    const { title, text } = htmlToText(FIXTURE);
    assert.equal(title, "Rooms — Docs");
    assert.match(text, /Managing rooms/);
    assert.match(text, /Add a room from Rooms & save\./);
    assert.match(text, /Step one/);
    assert.ok(!text.includes("console.log"));
    assert.ok(!text.includes("Settings Logout"));
    assert.ok(!text.includes("© 2026"));
    assert.ok(!text.includes("<"));
  });

  it("falls back gracefully without main/article/title", () => {
    const { title, text } = htmlToText("<p>Just text</p>");
    assert.equal(title, "");
    assert.equal(text, "Just text");
  });
});

describe("parseSitemapXml (R1)", () => {
  it("extracts deduped docs paths, ignoring the rest", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.vivereply.com/docs/rooms</loc></url>
      <url><loc>https://www.vivereply.com/docs/rooms/</loc></url>
      <url><loc>https://www.vivereply.com/pricing</loc></url>
      <url><loc>https://www.vivereply.com/docs/rooms/rates</loc></url>
      </urlset>`;
    assert.deepEqual(parseSitemapXml(xml), ["rooms", "rooms/rates"]);
  });

  it("returns null on garbage", () => {
    assert.equal(parseSitemapXml("not xml at all"), null);
    assert.equal(parseSitemapXml("<urlset></urlset>"), null);
  });
});

describe("citationFor (R1)", () => {
  it("renders docs citations as title + link", () => {
    assert.equal(citationFor("https://www.vivereply.com/docs/rooms", "Rooms"), "Rooms — https://www.vivereply.com/docs/rooms");
  });

  it("renders curated citations with entry titles", () => {
    assert.equal(
      citationFor("curated:troubleshooting-widget-not-loading", "Widget not loading on the website"),
      "Widget not loading on the website — https://www.vivereply.com/docs/chatbot/setup"
    );
    assert.equal(
      citationFor("curated:business-identity", "About ViveReply"),
      "About ViveReply (ViveReply business details)"
    );
  });

  it("falls back to the title for unknown sources", () => {
    assert.equal(citationFor("curated:nope", "Something"), "Something");
  });
});

describe("ingestAssistantCorpus orchestration (R1)", () => {
  function fakes({ pages, bodies = {}, statuses = {} }) {
    const stored = [];
    return {
      stored,
      deps: {
        fetchPage: async (url) => {
          const path = url.replace(`${DOCS_BASE}`, "").replace(/^\//, "") || "index";
          if (statuses[path]) return { status: statuses[path], html: "" };
          return { status: 200, html: bodies[path] ?? `<html><head><title>${path}</title></head><body><main><p>${"x ".repeat(300)}</p></main></body></html>` };
        },
        discoverSitemap: async () => pages,
        embed: async (texts) => texts.map(() => [0.1, 0.2]),
        replaceDocument: async (doc, embeddings) => {
          stored.push({ ...doc, vectors: embeddings.length });
          return doc.chunks.length;
        },
      },
    };
  }

  it("ingests docs pages plus every curated entry", async () => {
    const { stored, deps } = fakes({ pages: ["rooms"] });
    const report = await ingestAssistantCorpus(deps);
    assert.equal(report.pages.length, 1);
    assert.equal(report.pages[0].status, "ok");
    assert.ok(report.pages[0].chunks >= 1);
    assert.equal(report.curatedDocuments, CURATED_ENTRIES.length);
    assert.ok(stored.some((d) => d.source === `${DOCS_BASE}/rooms`));
    assert.ok(stored.some((d) => d.source === "curated:business-identity"));
    assert.equal(report.documents, 1 + CURATED_ENTRIES.length);
  });

  it("reports per-page failures and thin pages without dying", async () => {
    const { deps } = fakes({
      pages: ["rooms", "missing", "thin"],
      statuses: { missing: 404 },
      bodies: { thin: "<html><body><main><p>hi</p></main></body></html>" },
    });
    const report = await ingestAssistantCorpus(deps);
    const byPath = Object.fromEntries(report.pages.map((p) => [p.path, p]));
    assert.equal(byPath.rooms.status, "ok");
    assert.equal(byPath.missing.status, "failed");
    assert.equal(byPath.thin.status, "skipped");
    assert.equal(report.curatedDocuments, CURATED_ENTRIES.length);
  });

  it("falls back to the curated page list when discovery fails", async () => {
    const seen = [];
    const report = await ingestAssistantCorpus({
      fetchPage: async (url) => {
        seen.push(url);
        return { status: 200, html: `<html><body><main><p>${"y ".repeat(300)}</p></main></body></html>` };
      },
      discoverSitemap: async () => null,
      embed: async (texts) => texts.map(() => [0.1]),
      replaceDocument: async (doc) => doc.chunks.length,
    });
    assert.equal(report.pages.length, DOCS_PAGES.length);
    assert.ok(seen.some((u) => u.endsWith("/docs/rooms")));
  });
});
