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
// host is approved for the key's property (see /admin). Without a
// token, the panel shows an error instead of a chat — an unapproved
// site cannot host the bot by copying this script. The token is
// short-lived and scoped to one domain and property; /api/chat
// re-checks approval on every message, so deactivating a domain in
// /admin stops its widget on the next message. This script never sees
// messages or guest data; the iframe talks to /api/chat.

(function () {
  var scripts = document.getElementsByTagName("script");
  var current = scripts[scripts.length - 1];
  var src = current.getAttribute("src") || "";
  var origin = src.replace(/\/widget\.js.*$/, "");
  var key = current.getAttribute("data-key") || "demo-krishnachura";

  var button = document.createElement("button");
  button.textContent = "Chat";
  button.setAttribute("aria-label", "Open Vivereply Concierge chat");
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483647;" +
    "background:#111827;color:#fff;border:0;border-radius:9999px;" +
    "padding:13px 22px;font-size:14px;font-weight:600;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.22),0 2px 6px rgba(0,0,0,0.12);font-family:inherit;";

  var panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:20px;bottom:76px;z-index:2147483647;" +
    "width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 100px);" +
    "background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;" +
    "box-shadow:0 16px 48px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08);display:none;";

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
    button.textContent = open ? "Close" : "Chat";
  });

  document.body.appendChild(panel);
  document.body.appendChild(button);

  function showError(message) {
    var error = document.createElement("div");
    error.style.cssText = "padding:16px;font-size:14px;color:#374151;font-family:inherit;";
    error.textContent = message;
    panel.appendChild(error);
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
        showError(
          result.data && result.data.error
            ? result.data.error
            : "Chat is unavailable right now."
        );
        return;
      }
      var frame = document.createElement("iframe");
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
      showError("Chat is unavailable right now.");
    });
})();
