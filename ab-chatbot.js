(function () {
  const ABChatbot = {};

  const DEFAULT_WELCOME_TEXT =
    "Hello. I can help with punch issues, location, face verification, OTP, regularisation, and subscription/payment questions.";

  const READY_TEXT =
    "Context received from host app. You can now ask your support question.";

  ABChatbot.mount = function (selectorOrElement, options) {
    const root =
      typeof selectorOrElement === "string"
        ? document.querySelector(selectorOrElement)
        : selectorOrElement;

    if (!root) {
      throw new Error("ABChatbot root element not found.");
    }

    const cfg = normalizeConfig_(root, options || {});

    const state = {
      gasUrl: cfg.gasUrl,
      token: cfg.token || "",
      orgId: cfg.orgId,
      userId: cfg.userId,
      userName: cfg.userName,
      userEmail: cfg.userEmail,
      contexts: cfg.contexts,
      history: [],
      selectedChunks: [],
      lastMatches: [],
      isAsking: false,
      suggestionsCollapsed: false,
      hasShownReadyMessage: false
    };

    renderShell_(root, cfg);
    bindEvents_(root, state);
    init_(root, state);
  };

  async function init_(root, state) {
    if (state.token) {
      showReadyMessageOnce_(root, state);
      return;
    }

    addBotMessage_(
      root,
      "Chat session could not be initialized. Missing bootstrap token.",
      true
    );
  }

  function renderShell_(root, cfg) {
    root.innerHTML = `
      <div class="ab-chat-widget">
        <div class="ab-chat-header">
          <div class="ab-chat-title">${escapeHtml_(cfg.title || "Support Assistant")}</div>

          <div class="ab-chat-actions">
            <button class="ab-chat-clear" type="button" data-ab-clear aria-label="Clear chat">
              Clear
            </button>
            <button class="ab-chat-close" type="button" data-ab-close aria-label="Close support assistant">
              ×
            </button>
          </div>
        </div>

        <div class="ab-chat-context">
          <div class="ab-chat-context-line">
            Chat loaded. Context sent from host page.
          </div>
          <div class="ab-chat-context-line">
            ${escapeHtml_(formatContextLine_(cfg))}
          </div>
        </div>

        <div class="ab-suggestions-panel" data-ab-suggestions-panel>
          <button class="ab-suggestions-toggle" type="button" data-ab-toggle-suggestions>
            <span>Suggested questions</span>
            <span data-ab-suggestions-icon>⌃</span>
          </button>

          <div class="ab-suggested-row" data-ab-suggestions>
            ${renderSuggestionChips_(cfg.suggestions)}
          </div>
        </div>

        <div class="ab-chat-body" data-ab-body>
          ${renderDefaultBanner_()}
        </div>

        <div class="ab-chat-footer">
          <input
            class="ab-input"
            type="text"
            placeholder="${escapeHtml_(cfg.placeholder || "Ask a question...")}"
            data-ab-input
          />
          <button class="ab-send-button" type="button" data-ab-send>
            ${escapeHtml_(cfg.sendLabel || "Send")}
          </button>
        </div>
      </div>
    `;
  }

  function renderDefaultBanner_() {
    return `
      <div class="ab-message-row bot" data-ab-default-banner>
        <div class="ab-bubble">
          ${escapeHtml_(DEFAULT_WELCOME_TEXT)}
        </div>
      </div>
    `;
  }

  function renderSuggestionChips_(suggestions) {
    const list = Array.isArray(suggestions) && suggestions.length
      ? suggestions
      : [
          "I cannot punch in",
          "It says I am outside location",
          "My face verification is failing",
          "I did not receive OTP",
          "How do I regularise attendance?",
          "Payment done but subscription not updated"
        ];

    return list.map(function (text) {
      return `
        <button class="ab-suggestion-chip" type="button" data-ab-suggestion="${escapeAttr_(text)}">
          ${escapeHtml_(text)}
        </button>
      `;
    }).join("");
  }

  function bindEvents_(root, state) {
    const input = root.querySelector("[data-ab-input]");
    const send = root.querySelector("[data-ab-send]");

    send.addEventListener("click", function () {
      ask_(root, state);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        ask_(root, state);
      }
    });

    root.querySelectorAll("[data-ab-suggestion]").forEach(function (button) {
      button.addEventListener("click", function () {
        input.value = button.getAttribute("data-ab-suggestion") || "";
        ask_(root, state);
      });
    });

    const toggleSuggestions = root.querySelector("[data-ab-toggle-suggestions]");
    const suggestionsPanel = root.querySelector("[data-ab-suggestions-panel]");
    const suggestionsIcon = root.querySelector("[data-ab-suggestions-icon]");

    if (toggleSuggestions && suggestionsPanel) {
      toggleSuggestions.addEventListener("click", function () {
        state.suggestionsCollapsed = !state.suggestionsCollapsed;

        suggestionsPanel.classList.toggle(
          "ab-suggestions-collapsed",
          state.suggestionsCollapsed
        );

        if (suggestionsIcon) {
          suggestionsIcon.textContent = state.suggestionsCollapsed ? "⌄" : "⌃";
        }
      });
    }

    const clear = root.querySelector("[data-ab-clear]");
    if (clear) {
      clear.addEventListener("click", function () {
        resetChat_(root, state);
      });
    }

    const close = root.querySelector("[data-ab-close]");
    if (close) {
      close.addEventListener("click", function () {
        try {
          window.parent.postMessage({
            source: "AB_CHATBOT",
            type: "close"
          }, "*");
        } catch (err) {}

        /*
          Do not destroy the iframe or chatbot DOM.
          Parent loader should only hide the floating panel.
        */
      });
    }
  }

  function resetChat_(root, state) {
    const body = root.querySelector("[data-ab-body]");

    state.history = [];
    state.selectedChunks = [];
    state.lastMatches = [];
    state.isAsking = false;
    state.hasShownReadyMessage = false;

    body.innerHTML = renderDefaultBanner_();

    showReadyMessageOnce_(root, state);
    scrollBottom_(root);

    const input = root.querySelector("[data-ab-input]");
    const send = root.querySelector("[data-ab-send]");

    if (input) {
      input.disabled = false;
      input.value = "";
      input.focus();
    }

    if (send) {
      send.disabled = false;
    }
  }

  function showReadyMessageOnce_(root, state) {
    if (state.hasShownReadyMessage) return;

    state.hasShownReadyMessage = true;

    addBotMessage_(
      root,
      READY_TEXT
    );
  }

  async function ask_(root, state) {
    if (state.isAsking) return;

    const input = root.querySelector("[data-ab-input]");
    const send = root.querySelector("[data-ab-send]");
    const question = input.value.trim();

    if (!question) return;

    state.isAsking = true;
    send.disabled = true;
    input.disabled = true;
    input.value = "";

    addUserMessage_(root, question);

    state.history.push({
      role: "user",
      text: question
    });

    const loaderId = addLoader_(root, "Finding the closest help topics");

    try {
      const response = await callGas_(state.gasUrl, {
        action: "ask",
        token: state.token || "",
        orgId: state.orgId,
        userId: state.userId,
        userName: state.userName,
        userEmail: state.userEmail,
        contexts: state.contexts,
        question: question
      });

      removeLoader_(root, loaderId);

      if (!response.ok) {
        addBotMessage_(root, response.error || "Could not process your question.", true);
        return;
      }

      const matches = Array.isArray(response.matches) ? response.matches : [];

      if (!matches.length) {
        addBotMessage_(
          root,
          "I could not find an exact answer. Please try rephrasing your question or raise a support ticket."
        );
        renderTicketOnly_(root, state);
        return;
      }

      addBotMessage_(root, "Choose the closest matching topic:");
      renderMatchChips_(root, state, matches);

    } catch (err) {
      removeLoader_(root, loaderId);
      addBotMessage_(root, err.message || String(err), true);

    } finally {
      state.isAsking = false;
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  function renderMatchChips_(root, state, matches) {
    const body = root.querySelector("[data-ab-body]");
    state.lastMatches = matches;

    const chips = matches.map(function (item, index) {
      return `
        <button class="ab-match-chip" type="button" data-ab-match="${index}">
          ${escapeHtml_(item.title || item.subchunk_name || item.chunk_name || "Topic")}
        </button>
      `;
    }).join("");

    const row = document.createElement("div");
    row.className = "ab-match-row";
    row.innerHTML = `
      ${chips}
      <button class="ab-ticket-chip" type="button" data-ab-ticket>
        Raise ticket
      </button>
    `;

    body.appendChild(row);

    row.querySelectorAll("[data-ab-match]").forEach(function (button) {
      button.addEventListener("click", function () {
        const index = Number(button.getAttribute("data-ab-match"));
        showChunk_(root, state, state.lastMatches[index]);
      });
    });

    row.querySelector("[data-ab-ticket]").addEventListener("click", function () {
      raiseTicket_(root, state);
    });

    scrollBottom_(root);
  }

  function renderTicketOnly_(root, state) {
    const body = root.querySelector("[data-ab-body]");
    const row = document.createElement("div");

    row.className = "ab-match-row";
    row.innerHTML = `
      <button class="ab-ticket-chip" type="button" data-ab-ticket>
        Raise ticket
      </button>
    `;

    body.appendChild(row);

    row.querySelector("[data-ab-ticket]").addEventListener("click", function () {
      raiseTicket_(root, state);
    });

    scrollBottom_(root);
  }

  function showChunk_(root, state, item) {
    if (!item) return;

    const body = root.querySelector("[data-ab-body]");
    const title = item.title || item.subchunk_name || item.chunk_name || "Help topic";
    const content = item.content || "";

    state.selectedChunks.push({
      chunk_id: item.chunk_id || "",
      title: title,
      content: content,
      score: item.score || ""
    });

    state.history.push({
      role: "assistant",
      text: "Displayed topic: " + title
    });

    const card = document.createElement("div");
    card.className = "ab-answer-card";

    const html = markdownToHtml_(content, title);

    card.innerHTML = html;
    body.appendChild(card);

    scrollBottom_(root);
  }

  async function raiseTicket_(root, state) {
    const loaderId = addLoader_(root, "Creating support ticket");

    try {
      const response = await callGas_(state.gasUrl, {
        action: "ticket",
        token: state.token || "",
        orgId: state.orgId,
        userId: state.userId,
        userName: state.userName,
        userEmail: state.userEmail,
        contexts: state.contexts,
        history: state.history,
        selectedChunks: state.selectedChunks
      });

      removeLoader_(root, loaderId);

      if (!response.ok) {
        addBotMessage_(root, response.error || "Could not create ticket.", true);
        return;
      }

      const issueText = response.issueKey || "Support ticket";

      addBotMessage_(
        root,
        "Ticket created: " + issueText
      );

      if (response.issueUrl) {
        addBotMessage_(
          root,
          "Our support team can now review the request."
        );
      }

    } catch (err) {
      removeLoader_(root, loaderId);
      addBotMessage_(root, err.message || String(err), true);
    }
  }

  async function callGas_(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      redirect: "follow",
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid server response: " + text.slice(0, 200));
    }
  }

  function addUserMessage_(root, text) {
    const body = root.querySelector("[data-ab-body]");

    body.insertAdjacentHTML("beforeend", `
      <div class="ab-message-row user">
        <div class="ab-bubble">${escapeHtml_(text)}</div>
      </div>
    `);

    scrollBottom_(root);
  }

  function addBotMessage_(root, text, isError) {
    const body = root.querySelector("[data-ab-body]");

    body.insertAdjacentHTML("beforeend", `
      <div class="ab-message-row bot ${isError ? "error" : ""}">
        <div class="ab-bubble">${escapeHtml_(text)}</div>
      </div>
    `);

    scrollBottom_(root);
  }

  function addLoader_(root, label) {
    const body = root.querySelector("[data-ab-body]");
    const id = "loader_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    body.insertAdjacentHTML("beforeend", `
      <div class="ab-message-row bot" data-loader-id="${id}">
        <div class="ab-bubble">
          <span class="ab-loader-bubble">
            <span>${escapeHtml_(label || "Please wait")}</span>
            <span class="ab-loader-dot"></span>
            <span class="ab-loader-dot"></span>
            <span class="ab-loader-dot"></span>
          </span>
        </div>
      </div>
    `);

    scrollBottom_(root);
    return id;
  }

  function removeLoader_(root, id) {
    const el = root.querySelector('[data-loader-id="' + id + '"]');
    if (el) el.remove();
  }

  function markdownToHtml_(markdown, fallbackTitle) {
    const raw = String(markdown || "").trim();

    if (!raw) {
      return `<p>No content available.</p>`;
    }

    const lines = raw.split(/\r?\n/);
    const html = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (!line) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        continue;
      }

      if (/^####\s+/.test(line)) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        html.push("<h4>" + inlineMarkdown_(line.replace(/^####\s+/, "")) + "</h4>");
        continue;
      }

      if (/^###\s+/.test(line)) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        html.push("<h3>" + inlineMarkdown_(line.replace(/^###\s+/, "")) + "</h3>");
        continue;
      }

      if (/^##\s+/.test(line)) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        html.push("<h2>" + inlineMarkdown_(line.replace(/^##\s+/, "")) + "</h2>");
        continue;
      }

      if (/^#\s+/.test(line)) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        html.push("<h1>" + inlineMarkdown_(line.replace(/^#\s+/, "")) + "</h1>");
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }

        html.push("<li>" + inlineMarkdown_(line.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }

      if (inList) {
        html.push("</ul>");
        inList = false;
      }

      html.push("<p>" + inlineMarkdown_(line) + "</p>");
    }

    if (inList) {
      html.push("</ul>");
    }

    const hasHeading = /^#{1,4}\s+/m.test(raw);

    if (!hasHeading && fallbackTitle) {
      return "<h3>" + escapeHtml_(fallbackTitle) + "</h3>" + html.join("");
    }

    return html.join("");
  }

  function inlineMarkdown_(text) {
    return escapeHtml_(text)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function scrollBottom_(root) {
    const body = root.querySelector("[data-ab-body]");
    body.scrollTop = body.scrollHeight;
  }

  function normalizeConfig_(root, options) {
    return {
      gasUrl: options.gasUrl || root.getAttribute("data-gas-url") || "",
      token: options.token || root.getAttribute("data-token") || "",
      orgId: options.orgId || root.getAttribute("data-org-id") || "",
      userId: options.userId || root.getAttribute("data-user-id") || "",
      userName: options.userName || root.getAttribute("data-user-name") || "",
      userEmail: options.userEmail || root.getAttribute("data-user-email") || "",
      contexts: options.contexts || root.getAttribute("data-contexts") || "",
      title: options.title || root.getAttribute("data-title") || "Support Assistant",
      placeholder: options.placeholder || "Ask a question...",
      sendLabel: options.sendLabel || "Send",
      suggestions: options.suggestions || null
    };
  }

  function formatContextLine_(cfg) {
    const parts = [];

    if (cfg.orgId) parts.push(cfg.orgId);

    if (Array.isArray(cfg.contexts)) {
      if (cfg.contexts.length) parts.push(cfg.contexts.join(", "));
    } else if (cfg.contexts) {
      parts.push(cfg.contexts);
    }

    return parts.join(" • ");
  }

  function escapeHtml_(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr_(value) {
    return escapeHtml_(value).replace(/`/g, "&#096;");
  }

  window.ABChatbot = ABChatbot;
})();