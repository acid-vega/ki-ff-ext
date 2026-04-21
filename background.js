//const ANSWER_KEY= "n00ldw0u1dw4n770w47ch7h15—4nwhy1ru1z3d,7h30n1y71m31h4v3m4x1mum51l3nc3"

const IS_OPTIONS_PAGE =
  typeof window !== "undefined" &&
  typeof window.location !== "undefined" &&
  window.location.pathname.endsWith("/options.html");

const MENU_ROOT_ID = "rewrite-with-openai-root";
const MENU_SPELLING_ID = "rewrite-with-openai-spelling";
const MENU_OPTIMIZE_ID = "rewrite-with-openai-optimize";
const MENU_PROMPT_ID = "rewrite-with-openai-prompt";

const STORAGE_API_KEY = "openaiApiKey";
const STORAGE_MODEL = "openaiModel";

// FEATURE: Modell-Auswahl in den Erweiterungsoptionen
const AVAILABLE_MODELS = [
  {
    value: "gpt-4o-mini",
    label: "GPT-4o mini – schnell & günstig"
  },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 mini – Standard"
  },
  {
    value: "gpt-4.1",
    label: "GPT-4.1 – stärker"
  }
];

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

const PRESET_PROMPTS = {
  [MENU_SPELLING_ID]: [
    "Korrigiere ausschließlich Rechtschreibung, Grammatik, Zeichensetzung und offensichtliche Tippfehler.",
    "Erhalte Bedeutung, Stil und Struktur des Textes so weit wie möglich.",
    "Gib nur den finalen Text zurück, ohne Kommentare oder Erklärungen."
  ].join(" "),
  [MENU_OPTIMIZE_ID]: [
    "Optimiere den folgenden Text sprachlich.",
    "Verbessere Klarheit, Stil, Lesbarkeit, Grammatik und Struktur, ohne die Kernaussage zu verändern.",
    "Gib nur den finalen Text zurück, ohne Kommentare oder Erklärungen."
  ].join(" ")
};

if (IS_OPTIONS_PAGE) {
  document.addEventListener("DOMContentLoaded", () => {
    initOptionsPage().catch((error) => {
      console.error(error);
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.textContent = "Fehler beim Laden der Optionen: " + error.message;
        statusEl.className = "status error";
      }
    });
  });
} else {
  initBackground().catch(console.error);

  browser.runtime.onInstalled.addListener(() => {
    createContextMenus().catch(console.error);
  });

  if (browser.runtime.onStartup) {
    browser.runtime.onStartup.addListener(() => {
      createContextMenus().catch(console.error);
    });
  }

  browser.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick(info, tab).catch(async (error) => {
      console.error(error);

      if (tab?.id) {
        await showTabMessage(tab.id, "Fehler: " + error.message, true);
      }
    });
  });
}

async function initBackground() {
  await createContextMenus();
}

// FEATURE: Kontextmenü als Submenu mit drei Aktionen
async function createContextMenus() {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    id: MENU_ROOT_ID,
    title: "OpenAI Text",
    contexts: ["editable", "selection"]
  });

  browser.contextMenus.create({
    id: MENU_SPELLING_ID,
    parentId: MENU_ROOT_ID,
    title: "Rechtschreibung",
    contexts: ["editable", "selection"]
  });

  browser.contextMenus.create({
    id: MENU_OPTIMIZE_ID,
    parentId: MENU_ROOT_ID,
    title: "Optimieren",
    contexts: ["editable", "selection"]
  });

  browser.contextMenus.create({
    id: MENU_PROMPT_ID,
    parentId: MENU_ROOT_ID,
    title: "Prompt",
    contexts: ["editable", "selection"]
  });
}

async function handleContextMenuClick(info, tab) {
  if (!tab?.id) {
    return;
  }

  if (![MENU_SPELLING_ID, MENU_OPTIMIZE_ID, MENU_PROMPT_ID].includes(info.menuItemId)) {
    return;
  }

  const { openaiApiKey, openaiModel } = await getStoredSettings();

  if (!openaiApiKey) {
    await browser.runtime.openOptionsPage();
    await showTabMessage(
      tab.id,
      "Kein OpenAI API-Key gespeichert. Bitte in den Erweiterungsoptionen API-Key und Modell einrichten.",
      true
    );
    return;
  }

  const contextResponse = await browser.tabs.sendMessage(tab.id, {
    type: "GET_CONTEXT_TEXT"
  });

  if (!contextResponse?.ok || !String(contextResponse.text ?? "").trim()) {
    await showTabMessage(tab.id, "Keine bearbeitbare Auswahl oder kein Text gefunden.", true);
    return;
  }

  const inputText = String(contextResponse.text);
  const instructions =
    info.menuItemId === MENU_PROMPT_ID
      ? ""
      : PRESET_PROMPTS[info.menuItemId] || PRESET_PROMPTS[MENU_OPTIMIZE_ID];

  const rewrittenText = await runOpenAITextRequest({
    apiKey: openaiApiKey,
    model: openaiModel,
    inputText,
    instructions
  });

  const replaceResponse = await browser.tabs.sendMessage(tab.id, {
    type: "REPLACE_LAST_CONTEXT_TEXT",
    value: rewrittenText
  });

  if (!replaceResponse?.ok) {
    throw new Error("Der Text konnte nicht zurückgeschrieben werden.");
  }
}

async function getStoredSettings() {
  const stored = await browser.storage.local.get({
    [STORAGE_API_KEY]: "",
    [STORAGE_MODEL]: DEFAULT_OPENAI_MODEL
  });

  return {
    openaiApiKey: String(stored[STORAGE_API_KEY] || "").trim(),
    openaiModel: normalizeModel(stored[STORAGE_MODEL])
  };
}

function normalizeModel(model) {
  const value = String(model || "").trim();
  return AVAILABLE_MODELS.some((entry) => entry.value === value)
    ? value
    : DEFAULT_OPENAI_MODEL;
}

// FEATURE: Gemeinsame OpenAI-Anfrage für Umschreiben und Testen
async function runOpenAITextRequest({ apiKey, model, inputText, instructions = "" }) {
  const payload = {
    model: normalizeModel(model),
    input: String(inputText ?? ""),
    // FEATURE: Erzwingt Textausgabe statt strukturierter Formate
    text: {
      format: {
        type: "text"
      }
    }
  };

  if (String(instructions || "").trim()) {
    payload.instructions = String(instructions).trim();
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new Error("Die API hat keine gültige JSON-Antwort geliefert.");
  }

  if (!res.ok) {
    const apiError =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `HTTP ${res.status}`;

    throw new Error(`OpenAI API Fehler: ${res.status} ${apiError}`);
  }

  // FEATURE: Extrahiert robust nur den eigentlichen Modelltext, selbst wenn versehentlich die komplette JSON-Antwort zurückkommt
  const text = extractResponseText(data).trim();

  if (!text) {
    throw new Error("Keine Textantwort von der API erhalten.");
  }

  return text;
}

function extractResponseText(data) {
  const extracted = extractResponseTextInternal(data);

  if (!extracted) {
    throw new Error("Keine Textantwort von der API erhalten.");
  }

  return extracted;
}

// FEATURE: Rekursive Extraktion für normale Antwortobjekte und versehentlich zurückgelieferte JSON-Strings
function extractResponseTextInternal(value, depth = 0) {
  if (depth > 3 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return "";
    }

    const nestedJson = tryParseJson(trimmed);
    if (nestedJson) {
      const nestedText = extractResponseTextInternal(nestedJson, depth + 1);
      if (nestedText) {
        return nestedText;
      }
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractResponseTextInternal(item, depth + 1))
      .filter(Boolean);

    return parts.join("\n").trim();
  }

  if (typeof value !== "object") {
    return "";
  }

  if (typeof value.output_text === "string" && value.output_text.trim()) {
    const maybeNested = tryParseJson(value.output_text.trim());
    if (maybeNested) {
      const nestedText = extractResponseTextInternal(maybeNested, depth + 1);
      if (nestedText) {
        return nestedText;
      }
    }

    return value.output_text.trim();
  }

  if (Array.isArray(value.output)) {
    const outputTexts = [];

    for (const item of value.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }

      for (const contentItem of item.content) {
        if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
          outputTexts.push(contentItem.text);
        } else {
          const nestedText = extractResponseTextInternal(contentItem, depth + 1);
          if (nestedText) {
            outputTexts.push(nestedText);
          }
        }
      }
    }

    const joined = outputTexts.join("\n").trim();
    if (joined) {
      return joined;
    }
  }

  if (Array.isArray(value.content)) {
    const contentTexts = value.content
      .map((item) => {
        if (item?.type === "output_text" && typeof item.text === "string") {
          return item.text;
        }
        return extractResponseTextInternal(item, depth + 1);
      })
      .filter(Boolean);

    const joined = contentTexts.join("\n").trim();
    if (joined) {
      return joined;
    }
  }

  if (typeof value.text === "string" && value.text.trim()) {
    return value.text.trim();
  }

  return "";
}

function tryParseJson(text) {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return null;
  }
}

async function testApiKeyAndModel({ apiKey, model }) {
  await runOpenAITextRequest({
    apiKey: String(apiKey || "").trim(),
    model,
    inputText: "Antworte exakt mit OK.",
    instructions: "Gib ausschließlich OK zurück."
  });

  return true;
}

async function showTabMessage(tabId, message, isError = false) {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: isError ? "SHOW_ERROR" : "SHOW_MESSAGE",
      message
    });
  } catch (error) {
    console.warn("Nachricht an Tab konnte nicht gesendet werden:", error);
  }
}

// FEATURE: Optionsseite für API-Key, Modell und Verbindungstest
async function initOptionsPage() {
  const apiKeyInput = document.getElementById("apiKey");
  const modelSelect = document.getElementById("model");
  const settingsForm = document.getElementById("settings-form");
  const deleteButton = document.getElementById("deleteButton");
  const statusEl = document.getElementById("status");

  if (!apiKeyInput || !modelSelect || !settingsForm || !deleteButton || !statusEl) {
    throw new Error("Optionsseite konnte nicht initialisiert werden.");
  }

  populateModelSelect(modelSelect);

  const savedSettings = await getStoredSettings();
  apiKeyInput.value = savedSettings.openaiApiKey;
  modelSelect.value = savedSettings.openaiModel;

  setOptionsStatus(
    statusEl,
    savedSettings.openaiApiKey
      ? "API-Key ist lokal in Firefox gespeichert."
      : "Noch kein API-Key gespeichert.",
    savedSettings.openaiApiKey ? "success" : ""
  );

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const apiKey = String(apiKeyInput.value || "").trim();
    const model = normalizeModel(modelSelect.value);

    if (!apiKey) {
      setOptionsStatus(statusEl, "Bitte zuerst einen OpenAI API-Key eingeben.", "error");
      apiKeyInput.focus();
      return;
    }

    toggleOptionsBusy(true);
    setOptionsStatus(statusEl, "API-Key und Modell werden getestet ...", "");

    try {
      await testApiKeyAndModel({ apiKey, model });

      await browser.storage.local.set({
        [STORAGE_API_KEY]: apiKey,
        [STORAGE_MODEL]: model
      });

      setOptionsStatus(
        statusEl,
        "API-Key erfolgreich getestet und lokal gespeichert. Modell wurde ebenfalls gespeichert.",
        "success"
      );
    } catch (error) {
      setOptionsStatus(statusEl, "Test fehlgeschlagen: " + error.message, "error");
    } finally {
      toggleOptionsBusy(false);
    }
  });

  deleteButton.addEventListener("click", async () => {
    toggleOptionsBusy(true);

    try {
      await browser.storage.local.remove(STORAGE_API_KEY);

      apiKeyInput.value = "";
      setOptionsStatus(statusEl, "Gespeicherter API-Key wurde gelöscht.", "success");
      apiKeyInput.focus();
    } catch (error) {
      setOptionsStatus(statusEl, "Löschen fehlgeschlagen: " + error.message, "error");
    } finally {
      toggleOptionsBusy(false);
    }
  });

  function toggleOptionsBusy(isBusy) {
    apiKeyInput.disabled = isBusy;
    modelSelect.disabled = isBusy;
    deleteButton.disabled = isBusy;

    const submitButton = settingsForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isBusy;
    }
  }
}

function populateModelSelect(selectEl) {
  selectEl.innerHTML = "";

  for (const model of AVAILABLE_MODELS) {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label;
    selectEl.appendChild(option);
  }
}

function setOptionsStatus(statusEl, message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}
