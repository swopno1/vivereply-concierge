// Vivereply Concierge embed script (step 4). No dependencies, no
// build step — Next serves this file statically from /public.
// Usage on any site (replace the host with the Concierge deployment):
//   <script src="https://<concierge-host>/widget.js" data-key="demo-krishnachura"></script>
//
// How it works: the script derives its own origin from its <script>
// src, so the same file works on localhost and on a deployment with
// no code change. It adds a floating "Chat" button and an iframe
// panel pointing at /widget?key=<key> on that origin. The iframe is
// what talks to /api/chat; this script never sees messages, keys, or
// guest data. A missing data-key falls back to the demo key so the
// demo embed still works with a bare script tag.

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
    "background:#000;color:#fff;border:0;border-radius:9999px;" +
    "padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;" +
    "box-shadow:0 4px 16px rgba(0,0,0,0.25);font-family:inherit;";

  var panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:20px;bottom:76px;z-index:2147483647;" +
    "width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 100px);" +
    "background:#fff;border:1px solid #d1d5db;border-radius:16px;overflow:hidden;" +
    "box-shadow:0 8px 32px rgba(0,0,0,0.25);display:none;";

  var frame = document.createElement("iframe");
  frame.title = "Vivereply Concierge chat";
  frame.src = origin + "/widget?key=" + encodeURIComponent(key);
  frame.style.cssText = "width:100%;height:100%;border:0;";

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
    button.textContent = open ? "Close" : "Chat";
  });

  panel.appendChild(frame);
  document.body.appendChild(panel);
  document.body.appendChild(button);
})();
