//const ANSWER_KEY= "n00ldw0u1dw4n770w47ch7h15—4nwhy1ru1z3d,7h30n1y71m31h4v3m4x1mum51l3nc3"

const IS_OPTIONS_PAGE =
  typeof window !== "undefined" &&
  typeof window.location !== "undefined" &&
  window.location.pathname.endsWith("/options.html");

const MENU_ROOT_ID = "rewrite-with-openai-root";
const MENU_SPELLING_ID = "rewrite-with-openai-spelling";
const MENU_OPTIMIZE_ID = "rewrite-with-openai-optimize";
const MENU_NICER_ID = "rewrite-with-openai-nicer";
const MENU_PROMPT_ID = "rewrite-with-openai-prompt";

const STORAGE_API_KEY = "openaiApiKey";
const STORAGE_MODEL = "openaiModel";

// FEATURE: Fallback-Modelle bleiben verfügbar, falls die Live-Abfrage fehlschlägt
const FALLBACK_MODELS = [
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 mini – empfohlen"
  },
  {
    value: "gpt-4.1",
    label: "GPT-4.1 – stärker"
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o mini – schnell"
  }
];

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

// FEATURE: Cache für live geladene Textmodelle aus der API
let availableModelsCache = [...FALLBACK_MODELS];
let loadedModelCatalogApiKey = "";
let dynamicModelCatalogLoadedAt = 0;
let pendingModelCatalogPromise = null;

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
  ].join(" "),
  [MENU_NICER_ID]: [
    "Optimiere den folgenden Text sprachlich.",
    "Verbessere Klarheit, Stil, Lesbarkeit, Grammatik des Textes benutze Farbigemetaphern, der Text soll die gleiche aussage haben muss aber nicht 1 zu1 dem Original entsprechen.",
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
    id: MENU_NICER_ID,
    parentId: MENU_ROOT_ID,
    title: "Ausschmücken",
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

  if (![MENU_SPELLING_ID, MENU_OPTIMIZE_ID, MENU_NICER_ID, MENU_PROMPT_ID].includes(info.menuItemId)) {
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

// FEATURE: Modellwerte nicht mehr auf eine harte Liste beschränken, sondern Textmodelle allgemein erlauben
function normalizeModel(model) {
  const value = String(model || "").trim();
  return isSelectableTextModelId(value) ? value : DEFAULT_OPENAI_MODEL;
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
  const modelRefreshButton = document.getElementById("modelRefreshButton");
  const modelInfoEl = document.getElementById("modelInfo");
  const settingsForm = document.getElementById("settings-form");
  const deleteButton = document.getElementById("deleteButton");
  const statusEl = document.getElementById("status");

  if (
    !apiKeyInput ||
    !modelSelect ||
    !modelRefreshButton ||
    !modelInfoEl ||
    !settingsForm ||
    !deleteButton ||
    !statusEl
  ) {
    throw new Error("Optionsseite konnte nicht initialisiert werden.");
  }

  const savedSettings = await getStoredSettings();
  apiKeyInput.value = savedSettings.openaiApiKey;

  // FEATURE: Zuerst Fallback anzeigen, danach bei vorhandenem API-Key die Live-Liste laden
  populateModelSelect(modelSelect, getKnownModelOptions(), savedSettings.openaiModel);

  setOptionsStatus(
    statusEl,
    savedSettings.openaiApiKey
      ? "API-Key ist lokal in Firefox gespeichert."
      : "Noch kein API-Key gespeichert.",
    savedSettings.openaiApiKey ? "success" : ""
  );

  setModelInfo(
    modelInfoEl,
    savedSettings.openaiApiKey
      ? "Beim Öffnen der Modellauswahl werden kompatible Textmodelle live von der API geladen."
      : "Mit einem API-Key kannst du die kompatiblen Textmodelle live von der API laden."
  );

  let isSubmitting = false;
  let isLoadingModels = false;

  updateControls();

  if (savedSettings.openaiApiKey) {
    await refreshModelCatalog({
      preserveSelection: savedSettings.openaiModel,
      showStatus: false
    });
  }

  // FEATURE: Bei Änderung des API-Keys Live-Liste zurücksetzen, damit beim nächsten Öffnen neu geladen wird
  apiKeyInput.addEventListener("input", () => {
    if (String(apiKeyInput.value || "").trim() !== loadedModelCatalogApiKey) {
      availableModelsCache = [...FALLBACK_MODELS];
      loadedModelCatalogApiKey = "";
      dynamicModelCatalogLoadedAt = 0;

      populateModelSelect(modelSelect, getKnownModelOptions(), modelSelect.value || savedSettings.openaiModel);
      setModelInfo(
        modelInfoEl,
        String(apiKeyInput.value || "").trim()
          ? "API-Key geändert. Öffne die Modellauswahl oder lade die Modellliste neu."
          : "Mit einem API-Key kannst du die kompatiblen Textmodelle live von der API laden."
      );
    }

    updateControls();
  });

  // FEATURE: Live-Abfrage beim Auswählen des Modells
  modelSelect.addEventListener("focus", () => {
    const apiKey = String(apiKeyInput.value || "").trim();
    if (!apiKey || hasFreshModelCatalogForKey(apiKey)) {
      return;
    }

    refreshModelCatalog({
      preserveSelection: modelSelect.value,
      showStatus: false
    }).catch(console.error);
  });

  // FEATURE: Manuelles Neuladen der Modellliste
  modelRefreshButton.addEventListener("click", async () => {
    await refreshModelCatalog({
      preserveSelection: modelSelect.value,
      forceReload: true,
      showStatus: true
    });
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const apiKey = String(apiKeyInput.value || "").trim();
    const model = normalizeModel(modelSelect.value);

    if (!apiKey) {
      setOptionsStatus(statusEl, "Bitte zuerst einen OpenAI API-Key eingeben.", "error");
      apiKeyInput.focus();
      return;
    }

    isSubmitting = true;
    updateControls();
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
      isSubmitting = false;
      updateControls();
    }
  });

  deleteButton.addEventListener("click", async () => {
    isSubmitting = true;
    updateControls();

    try {
      await browser.storage.local.remove(STORAGE_API_KEY);

      apiKeyInput.value = "";
      availableModelsCache = [...FALLBACK_MODELS];
      loadedModelCatalogApiKey = "";
      dynamicModelCatalogLoadedAt = 0;

      populateModelSelect(modelSelect, getKnownModelOptions(), modelSelect.value || DEFAULT_OPENAI_MODEL);
      setModelInfo(
        modelInfoEl,
        "API-Key gelöscht. Es werden nur noch die eingebauten Fallback-Textmodelle angezeigt."
      );
      setOptionsStatus(statusEl, "Gespeicherter API-Key wurde gelöscht.", "success");
      apiKeyInput.focus();
    } catch (error) {
      setOptionsStatus(statusEl, "Löschen fehlgeschlagen: " + error.message, "error");
    } finally {
      isSubmitting = false;
      updateControls();
    }
  });

  function updateControls() {
    const isBusy = isSubmitting || isLoadingModels;
    const hasApiKey = !!String(apiKeyInput.value || "").trim();

    apiKeyInput.disabled = isSubmitting;
    modelSelect.disabled = isBusy;
    deleteButton.disabled = isBusy;
    modelRefreshButton.disabled = isBusy || !hasApiKey;

    const submitButton = settingsForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isBusy;
    }
  }

  async function refreshModelCatalog({
    preserveSelection = DEFAULT_OPENAI_MODEL,
    forceReload = false,
    showStatus = true
  } = {}) {
    const apiKey = String(apiKeyInput.value || "").trim();

    if (!apiKey) {
      setOptionsStatus(statusEl, "Bitte zuerst einen OpenAI API-Key eingeben.", "error");
      apiKeyInput.focus();
      return;
    }

    if (!forceReload && hasFreshModelCatalogForKey(apiKey)) {
      populateModelSelect(modelSelect, getKnownModelOptions(), preserveSelection);
      return;
    }

    isLoadingModels = true;
    updateControls();
    setModelInfo(modelInfoEl, "Kompatible Textmodelle werden von der API geladen ...");

    if (showStatus) {
      setOptionsStatus(statusEl, "Modellliste wird geladen ...", "");
    }

    try {
      const liveModels = await fetchAvailableModels(apiKey);
      populateModelSelect(modelSelect, liveModels, preserveSelection);

      setModelInfo(
        modelInfoEl,
        `${liveModels.length} kompatible Textmodelle geladen. Bild-, Audio-, Embedding- und DALL·E-Modelle werden ausgeblendet.`
      );

      if (showStatus) {
        setOptionsStatus(statusEl, "Modellliste erfolgreich aktualisiert.", "success");
      }
    } catch (error) {
      populateModelSelect(modelSelect, getKnownModelOptions(), preserveSelection);
      setModelInfo(
        modelInfoEl,
        "Modellliste konnte nicht geladen werden. Es wird die eingebaute Fallback-Liste angezeigt."
      );

      if (showStatus) {
        setOptionsStatus(statusEl, "Modellliste konnte nicht geladen werden: " + error.message, "error");
      }
    } finally {
      isLoadingModels = false;
      updateControls();
    }
  }
}

// FEATURE: Holt die verfügbaren Modelle von der OpenAI API und filtert unpassende Typen aus
async function fetchAvailableModels(apiKey) {
  const trimmedApiKey = String(apiKey || "").trim();

  if (!trimmedApiKey) {
    throw new Error("Es wurde kein API-Key angegeben.");
  }

  if (pendingModelCatalogPromise && loadedModelCatalogApiKey === trimmedApiKey) {
    return pendingModelCatalogPromise;
  }

  loadedModelCatalogApiKey = trimmedApiKey;

  pendingModelCatalogPromise = (async () => {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${trimmedApiKey}`
      }
    });

    const rawText = await res.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      throw new Error("Die Modellliste konnte nicht als JSON gelesen werden.");
    }

    if (!res.ok) {
      const apiError =
        data?.error?.message ||
        data?.message ||
        rawText ||
        `HTTP ${res.status}`;

      throw new Error(`OpenAI API Fehler: ${res.status} ${apiError}`);
    }

    const liveModels = Array.isArray(data?.data)
      ? data.data
          .map((entry) => String(entry?.id || "").trim())
          .filter(Boolean)
          .filter(isSelectableTextModelId)
          .map((modelId) => ({
            value: modelId,
            label: buildModelLabel(modelId)
          }))
      : [];

    const merged = mergeUniqueModelOptions([...liveModels, ...FALLBACK_MODELS]);
    const sorted = sortModelOptions(merged);

    if (!sorted.length) {
      throw new Error("Es wurden keine kompatiblen Textmodelle gefunden.");
    }

    availableModelsCache = sorted;
    dynamicModelCatalogLoadedAt = Date.now();

    return sorted;
  })();

  try {
    return await pendingModelCatalogPromise;
  } finally {
    pendingModelCatalogPromise = null;
  }
}

function getKnownModelOptions() {
  return mergeUniqueModelOptions([...availableModelsCache, ...FALLBACK_MODELS]);
}

// FEATURE: Filtert DALL·E, Audio-, Embedding- und ähnliche Spezialmodelle aus
function isSelectableTextModelId(modelId) {
  const value = String(modelId || "").trim().toLowerCase();

  if (!value) {
    return false;
  }

  const blockedTokens = [
    "dall-e",
    "gpt-image",
    "image",
    "whisper",
    "tts",
    "transcribe",
    "speech",
    "audio",
    "embedding",
    "embed",
    "moderation",
    "rerank",
    "search",
    "realtime",
    "computer-use",
    "vision-preview",
    "sora"
  ];

  if (blockedTokens.some((token) => value.includes(token))) {
    return false;
  }

  return /^(gpt-|chatgpt|o1|o3|o4|codex)/.test(value);
}

function buildModelLabel(modelId) {
  const value = String(modelId || "").trim();
  const baseId = stripModelDateSuffix(value);
  const details = [];

  if (baseId === DEFAULT_OPENAI_MODEL) {
    details.push("empfohlen");
  }

  if (/^o[134]/i.test(baseId)) {
    details.push("Reasoning");
  }

  if (/preview/i.test(value)) {
    details.push("Preview");
  }

  if (/latest/i.test(value)) {
    details.push("Alias");
  }

  const dateMatch = value.match(/(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    details.push(dateMatch[1]);
  }

  return `${prettifyModelName(baseId)}${details.length ? " – " + details.join(", ") : ""}`;
}

function prettifyModelName(modelId) {
  return String(modelId || "")
    .trim()
    .replace(/^gpt-/i, "GPT-")
    .replace(/^chatgpt/i, "ChatGPT")
    .replace(/^codex/i, "Codex")
    .replace(/-/g, " ")
    .replace(/\bpreview\b/gi, "Preview")
    .replace(/\blatest\b/gi, "latest");
}

function stripModelDateSuffix(modelId) {
  return String(modelId || "").replace(/-\d{4}-\d{2}-\d{2}$/i, "");
}

function mergeUniqueModelOptions(modelOptions) {
  const map = new Map();

  for (const option of modelOptions || []) {
    const value = String(option?.value || "").trim();

    if (!isSelectableTextModelId(value) || map.has(value)) {
      continue;
    }

    map.set(value, {
      value,
      label: String(option?.label || buildModelLabel(value)).trim()
    });
  }

  return Array.from(map.values());
}

function sortModelOptions(modelOptions) {
  const priorityOrder = [
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
    "gpt-4o",
    "o4-mini",
    "o4",
    "o3-mini",
    "o3",
    "o1-mini",
    "o1"
  ];

  return [...modelOptions].sort((a, b) => {
    const baseA = stripModelDateSuffix(a.value);
    const baseB = stripModelDateSuffix(b.value);
    const rankA = priorityOrder.indexOf(baseA);
    const rankB = priorityOrder.indexOf(baseB);

    if (rankA !== rankB) {
      return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
    }

    const hasDateA = baseA !== a.value;
    const hasDateB = baseB !== b.value;

    if (baseA === baseB && hasDateA !== hasDateB) {
      return hasDateA ? 1 : -1;
    }

    return a.value.localeCompare(b.value, "de", { numeric: true, sensitivity: "base" });
  });
}

function hasFreshModelCatalogForKey(apiKey) {
  const trimmedApiKey = String(apiKey || "").trim();

  return (
    !!trimmedApiKey &&
    loadedModelCatalogApiKey === trimmedApiKey &&
    dynamicModelCatalogLoadedAt > 0
  );
}

function populateModelSelect(selectEl, modelOptions = getKnownModelOptions(), selectedValue = DEFAULT_OPENAI_MODEL) {
  const options = mergeUniqueModelOptions(modelOptions);
  const normalizedSelected = normalizeModel(selectedValue);

  // FEATURE: Gespeichertes Modell sichtbar halten, auch wenn es nicht in der aktuellen Live-Liste steckt
  if (
    normalizedSelected &&
    isSelectableTextModelId(normalizedSelected) &&
    !options.some((entry) => entry.value === normalizedSelected)
  ) {
    options.unshift({
      value: normalizedSelected,
      label: `${buildModelLabel(normalizedSelected)} – gespeichert`
    });
  }

  const sortedOptions = sortModelOptions(options);
  const finalOptions = sortedOptions.length ? sortedOptions : [...FALLBACK_MODELS];

  selectEl.innerHTML = "";

  for (const model of finalOptions) {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label;
    selectEl.appendChild(option);
  }

  const selectedExists = finalOptions.some((entry) => entry.value === normalizedSelected);
  selectEl.value = selectedExists ? normalizedSelected : DEFAULT_OPENAI_MODEL;
}

function setOptionsStatus(statusEl, message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

function setModelInfo(infoEl, message) {
  infoEl.textContent = message;
}
