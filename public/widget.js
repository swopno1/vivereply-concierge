// Vivereply Concierge embed script (step 4, handshake since step 4.5).
// No dependencies, no build step — Next serves this file statically
// from /public. Usage on any site (replace the host with the Concierge
// deployment):
//   <script src="https://<concierge-host>/widget.js" data-key="demo-krishnachura"></script>
//
// How it works: the script derives its own origin from its <script>
// src, so the same file works on localhost and on a deployment with
// no code change. It then asks that origin for a widget token, sending
// the embed key. The browser attaches the host page's Origin header to
// that request, and the server only issues a token when that origin's
// host is approved for the key's property (see Settings). Without a
// token, the panel shows an error with a retry button instead of a
// chat — an unapproved site cannot host the bot by copying this
// script. The token is short-lived and scoped to one domain and
// property; /api/chat re-checks approval on every message, so
// deactivating a domain in Settings stops its widget on the next
// message. This script never sees messages or guest data; the iframe
// talks to /api/chat.
//
// Accessibility contract: the trigger is a native button (tab
// reachable, visible focus, aria-expanded); the panel is a modeless
// dialog (role=dialog WITHOUT aria-modal — the host page stays usable
// while it is open); Escape closes it and returns focus to the
// trigger; opening it asks the iframe to focus its input via
// postMessage (the host cannot reach inside the frame directly).

(function () {
  var scripts = document.getElementsByTagName("script");
  var current = scripts[scripts.length - 1];
  var src = current.getAttribute("src") || "";
  var origin = src.replace(/\/widget\.js.*$/, "");
  var key = current.getAttribute("data-key") || "demo-krishnachura";

  // /admin pages are staff screens, not guest surfaces — the guest chat
  // button must never render there.
  if (window.location && /^\/admin(\/|$)/.test(window.location.pathname || "")) return;

  // Visible keyboard focus that survives any host site's styles.
  var focusStyle = document.createElement("style");
  focusStyle.textContent =
    "#vivereply-concierge-button:focus-visible{outline:3px solid #2563eb;outline-offset:2px;}" +
    "#vivereply-concierge-panel button:focus-visible{outline:3px solid #2563eb;outline-offset:2px;}";
  document.head.appendChild(focusStyle);

  var button = document.createElement("button");
  button.id = "vivereply-concierge-button";
  button.setAttribute("aria-label", "Open Vivereply Concierge chat");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "vivereply-concierge-panel");
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483647;" +
    "display:flex;align-items:center;min-height:44px;" +
    "background:#111827;color:#fff;border:0;border-radius:9999px;" +
    "padding:11px 22px 11px 14px;font-size:14px;font-weight:600;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.22),0 2px 6px rgba(0,0,0,0.12);font-family:inherit;";
  var icon = document.createElement("img");
  icon.src = origin + "/brand/vivereply-mark.svg";
  icon.alt = "";
  icon.style.cssText = "width:22px;height:22px;margin-right:8px;";
  var label = document.createElement("span");
  label.textContent = "Chat";
  button.appendChild(icon);
  button.appendChild(label);

  var panel = document.createElement("div");
  panel.id = "vivereply-concierge-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Vivereply Concierge chat");
  panel.style.cssText =
    "position:fixed;right:20px;bottom:76px;z-index:2147483647;" +
    "width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 100px);" +
    "background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;" +
    "box-shadow:0 16px 48px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08);display:none;";
  panel.setAttribute("aria-hidden", "true");

  var open = false;
  var frame = null;

  function setOpen(next) {
    open = next;
    panel.style.display = open ? "block" : "none";
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute(
      "aria-label",
      open ? "Close Vivereply Concierge chat" : "Open Vivereply Concierge chat"
    );
    label.textContent = open ? "Close" : "Chat";
    if (open) {
      // Funnel beacon: counts panel OPENS (page loads don't reach
      // here). Fire-and-forget — metrics must never disturb chat.
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(origin + "/api/widget-open", JSON.stringify({ key: key }));
        }
      } catch (e) {
        /* metrics are best-effort */
      }
    }
    if (open && frame && frame.contentWindow) {
      // Ask the chat to focus its input. The host cannot reach into
      // the frame, so this is a request, not a command — the chat
      // decides (and focusing is harmless if anything else sends it).
      frame.contentWindow.postMessage({ type: "vivereply:focus-input" }, origin);
    }
    if (!open) button.focus();
  }

  button.addEventListener("click", function () {
    setOpen(!open);
  });

  // Escape closes from anywhere on the host page while open. Focus
  // returns to the trigger via setOpen(false).
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) setOpen(false);
  });

  document.body.appendChild(panel);
  document.body.appendChild(button);

  // Static loading skeleton (no animation — nothing to gate on
  // reduced-motion): grey bars replaced by the chat or the error.
  function showSkeleton() {
    panel.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.setAttribute("aria-busy", "true");
    wrap.setAttribute("aria-label", "Loading chat");
    wrap.style.cssText = "padding:16px;display:flex;flex-direction:column;gap:10px;";
    var widths = ["45%", "80%", "65%"];
    for (var i = 0; i < widths.length; i++) {
      var bar = document.createElement("div");
      bar.style.cssText =
        "height:14px;border-radius:7px;background:#e5e7eb;width:" + widths[i] + ";";
      wrap.appendChild(bar);
    }
    panel.appendChild(wrap);
  }

  // Server errors are embed jargon ("Unknown widget key."). Guests get
  // plain language; the technical string is never shown verbatim.
  function friendlyError(raw) {
    if (!raw) return "Chat is unavailable right now.";
    if (/unknown widget key/i.test(raw)) return "This chat isn't set up yet. Please try again later.";
    if (/no longer approved|not approved/i.test(raw)) {
      return "This site can't host this chat right now.";
    }
    if (/unavailable|network|failed to fetch/i.test(raw)) return "Chat is unavailable right now.";
    return "Chat is unavailable right now.";
  }

  // Every failure ends in a retry button — dead ends lose guests on
  // flaky networks, and offline-then-online must recover without a
  // page reload.
  function showError(message) {
    panel.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "padding:16px;font-size:14px;color:#374151;font-family:inherit;";
    var text = document.createElement("p");
    text.style.cssText = "margin:0 0 12px;";
    text.textContent = message;
    var retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.style.cssText =
      "min-height:44px;padding:8px 20px;font-size:14px;font-weight:600;cursor:pointer;" +
      "background:#111827;color:#fff;border:0;border-radius:9999px;font-family:inherit;";
    retry.addEventListener("click", function () {
      loadToken();
    });
    wrap.appendChild(text);
    wrap.appendChild(retry);
    panel.appendChild(wrap);
  }

  function loadToken() {
    showSkeleton();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showError("You appear to be offline. Check your connection, then try again.");
      return;
    }
    fetch(origin + "/api/widget-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data.token) {
          showError(friendlyError(result.data && result.data.error));
          return;
        }
        panel.innerHTML = "";
        frame = document.createElement("iframe");
        frame.title = "Vivereply Concierge chat";
        frame.src =
          origin +
          "/widget?key=" +
          encodeURIComponent(key) +
          "&token=" +
          encodeURIComponent(result.data.token);
        frame.style.cssText = "width:100%;height:100%;border:0;";
        panel.appendChild(frame);
      })
      .catch(function () {
        showError(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "You appear to be offline. Check your connection, then try again."
            : "Chat is unavailable right now."
        );
      });
  }

  // Coming back online retries an errored panel automatically — but
  // never clobbers a live chat frame.
  window.addEventListener("online", function () {
    if (!frame) loadToken();
  });

  loadToken();
})();
