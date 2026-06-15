(function () {
  var script = document.currentScript;

  if (!script) {
    console.error("[AB Chatbot] Loader could not find current script.");
    return;
  }

  var cfg = {
    gasUrl: script.getAttribute("data-gas-url") || "",
    orgId: script.getAttribute("data-org-id") || "",
    userId: script.getAttribute("data-user-id") || "",
    userName: script.getAttribute("data-user-name") || "",
    userEmail: script.getAttribute("data-user-email") || "",
    contexts: script.getAttribute("data-contexts") || "",
    title: script.getAttribute("data-title") || "Support Assistant",
    launcherText: script.getAttribute("data-launcher-text") || "?",
    side: script.getAttribute("data-side") || "right",
    mode: script.getAttribute("data-mode") || "floating"
  };

  if (!cfg.gasUrl) {
    console.error("[AB Chatbot] Missing gasUrl.");
    return;
  }

  var els = null;
  var hasLoaded = false;
  var isOpen = false;

  ready_(function () {
    injectStyles_();
    els = createUi_();
    bind_();

    if (cfg.mode === "fullscreen") {
      openFullscreen_();
    }
  });

  function bind_() {
    if (els.button) {
      els.button.addEventListener("click", function () {
        if (isOpen) {
          close_();
        } else {
          open_();
        }
      });
    }

    window.addEventListener("message", function (event) {
      var data = event.data || {};

      if (data && data.source === "AB_CHATBOT" && data.type === "close") {
        close_();
      }
    });
  }

  function open_() {
    isOpen = true;
    els.panel.classList.add("ab-bot-open");

    if (els.button) {
      els.button.classList.add("ab-bot-launcher-active");
    }

    if (!hasLoaded) {
      hasLoaded = true;
      loadBot_();
    }
  }

  function openFullscreen_() {
    isOpen = true;
    hasLoaded = true;
    els.panel.classList.add("ab-bot-open");
    els.panel.classList.add("ab-bot-fullscreen");

    if (els.button) {
      els.button.style.display = "none";
    }

    loadBot_();
  }

  function close_() {
    if (cfg.mode === "fullscreen") {
      return;
    }

    isOpen = false;
    els.panel.classList.remove("ab-bot-open");

    if (els.button) {
      els.button.classList.remove("ab-bot-launcher-active");
    }
  }

  async function loadBot_() {
    try {
      els.frame.srcdoc = loadingHtml_();
	  
      var loaderUrl = script.src || "";
      var assetBase = loaderUrl ? new URL(".", loaderUrl).href : "";
      var assetVersion = String(Date.now());	  
      var chatbotJsUrl =
        script.getAttribute("data-chatbot-js-url") ||
        assetBase + "ab-chatbot.js?v=" + assetVersion;
      var chatbotCssUrl =
        script.getAttribute("data-chatbot-css-url") ||
        assetBase + "ab-chatbot.css?v=" + assetVersion;

      var html = await fetchGasHtml_(cfg.gasUrl, {
        action: "embed",
        orgId: cfg.orgId,
        userId: cfg.userId,
        userName: cfg.userName,
        userEmail: cfg.userEmail,
        contexts: cfg.contexts,
        title: cfg.title,
        chatbotJsUrl: chatbotJsUrl,
        chatbotCssUrl: chatbotCssUrl
      });

      if (!html || !html.trim()) {
        throw new Error("GAS returned empty chatbot HTML.");
      }

      els.frame.srcdoc = html;

    } catch (err) {
      console.error("[AB Chatbot]", err);
      els.frame.srcdoc = errorHtml_(err);
    }
  }

  async function fetchGasHtml_(url, payload) {
    var response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      redirect: "follow",
      body: JSON.stringify(payload)
    });

    var text = await response.text();

    if (!response.ok) {
      throw new Error("GAS HTTP " + response.status + ": " + text.slice(0, 300));
    }

    return text;
  }

  function createUi_() {
    var panel = document.createElement("div");
    panel.className = "ab-bot-panel ab-bot-panel-" + cfg.side;

    var frame = document.createElement("iframe");
    frame.className = "ab-bot-frame";
    frame.title = cfg.title;
    frame.setAttribute("allow", "clipboard-write");

    panel.appendChild(frame);
    document.body.appendChild(panel);

    var button = null;

    if (cfg.mode !== "fullscreen") {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ab-bot-launcher ab-bot-launcher-" + cfg.side;
      button.setAttribute("aria-label", "Open support assistant");
      button.innerHTML =
        '<span class="ab-bot-launcher-icon">' +
        escapeHtml_(cfg.launcherText) +
        "</span>";

      document.body.appendChild(button);
    }

    return {
      panel: panel,
      frame: frame,
      button: button
    };
  }

  function injectStyles_() {
    if (document.getElementById("ab-chatbot-loader-style")) return;

    var style = document.createElement("style");
    style.id = "ab-chatbot-loader-style";

    style.textContent = [
      ".ab-bot-panel{",
        "position:fixed;",
        "right:20px;",
        "bottom:92px;",
        "width:min(370px,calc(100vw - 32px));",
        "height:min(620px,calc(100vh - 120px));",
        "height:min(620px,calc(100dvh - 120px));",
        "background:#fff;",
        "border-radius:18px;",
        "box-shadow:0 22px 60px rgba(16,24,40,.28);",
        "overflow:hidden;",
        "z-index:2147483646;",
        "opacity:0;",
        "transform:translateY(16px) scale(.98);",
        "pointer-events:none;",
        "transition:opacity .18s ease,transform .18s ease;",
      "}",

      ".ab-bot-panel-left{left:20px;right:auto;}",

      ".ab-bot-panel.ab-bot-open{",
        "opacity:1;",
        "transform:translateY(0) scale(1);",
        "pointer-events:auto;",
      "}",

      ".ab-bot-fullscreen{",
        "position:fixed!important;",
        "inset:0!important;",
        "right:auto!important;",
        "bottom:auto!important;",
        "width:100vw!important;",
        "height:100vh!important;",
        "height:100dvh!important;",
        "border-radius:0!important;",
        "box-shadow:none!important;",
        "opacity:1!important;",
        "transform:none!important;",
        "pointer-events:auto!important;",
      "}",

      ".ab-bot-frame{",
        "display:block;",
        "width:100%;",
        "height:100%;",
        "border:0;",
        "background:#fff;",
      "}",

      ".ab-bot-launcher{",
        "position:fixed;",
        "right:22px;",
        "bottom:22px;",
        "width:58px;",
        "height:58px;",
        "border:0;",
        "border-radius:999px;",
        "background:#1f8f4d;",
        "color:#fff;",
        "box-shadow:0 16px 36px rgba(16,24,40,.28);",
        "z-index:2147483647;",
        "cursor:pointer;",
        "display:flex;",
        "align-items:center;",
        "justify-content:center;",
        "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
        "font-size:30px;",
        "font-weight:800;",
        "line-height:1;",
        "transition:transform .15s ease,background .15s ease,box-shadow .15s ease;",
      "}",

      ".ab-bot-launcher-left{left:22px;right:auto;}",

      ".ab-bot-launcher:hover{",
        "transform:translateY(-1px);",
        "background:#187a41;",
        "box-shadow:0 18px 42px rgba(16,24,40,.32);",
      "}",

      ".ab-bot-launcher-active{background:#166534;}",

      ".ab-bot-launcher-icon{display:block;transform:translateY(-1px);}",

      "@media(max-width:640px){",
        ".ab-bot-panel{",
          "right:0;",
          "left:0;",
          "bottom:0;",
          "width:100vw;",
          "height:100vh;",
          "height:100dvh;",
          "border-radius:0;",
          "transform:translateY(100%);",
        "}",

        ".ab-bot-panel-left{left:0;right:0;}",

        ".ab-bot-panel.ab-bot-open{transform:translateY(0);}",

        ".ab-bot-launcher{right:18px;bottom:18px;}",

        ".ab-bot-launcher-left{left:18px;right:auto;}",
      "}"
    ].join("");

    document.head.appendChild(style);
  }

  function loadingHtml_() {
    return [
      "<!doctype html>",
      "<html>",
      "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<style>",
          "html,body{margin:0;height:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8faf9;color:#14532d;}",
          ".wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center;}",
          ".card{max-width:320px;background:#fff;border:1px solid #d7e7dc;border-radius:16px;padding:20px;box-shadow:0 10px 28px rgba(16,24,40,.08);}",
          ".title{font-weight:700;margin-bottom:8px;}",
          ".text{font-size:14px;color:#475467;}",
        "</style>",
      "</head>",
      "<body>",
        '<div class="wrap"><div class="card"><div class="title">Loading support assistant</div><div class="text">Preparing chat experience...</div></div></div>',
      "</body>",
      "</html>"
    ].join("");
  }

  function errorHtml_(err) {
    var message = escapeHtml_(err && err.message ? err.message : String(err));

    return [
      "<!doctype html>",
      "<html>",
      "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<style>",
          "html,body{margin:0;height:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff5f5;color:#912018;}",
          ".wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}",
          ".card{max-width:360px;background:#fff;border:1px solid #fecaca;border-radius:16px;padding:18px;box-shadow:0 10px 28px rgba(16,24,40,.08);}",
          ".title{font-weight:700;margin-bottom:8px;}",
          ".text{font-size:14px;line-height:1.45;word-break:break-word;}",
        "</style>",
      "</head>",
      "<body>",
        '<div class="wrap"><div class="card"><div class="title">Support assistant could not load</div><div class="text">' + message + "</div></div></div>",
      "</body>",
      "</html>"
    ].join("");
  }

  function ready_(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function escapeHtml_(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();