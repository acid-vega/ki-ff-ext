let lastFocusedEditable = null;
let lastContextTarget = null;
let lastResolvedContext = null;
let lastUndoState = null;

// FEATURE: Zuletzt fokussiertes editierbares Element merken
document.addEventListener(
  "focusin",
  (event) => {
    const editable = getEditableTarget(event.target);
    if (editable) {
      lastFocusedEditable = editable;
    }
  },
  true
);

// FEATURE: Kontext-Ziel für Rechtsklick merken
document.addEventListener(
  "contextmenu",
  (event) => {
    lastContextTarget = event.target;

    const editable = getEditableTarget(event.target);
    if (editable) {
      lastFocusedEditable = editable;
    }
  },
  true
);

// FEATURE: Eigenes Undo per Ctrl/Cmd+Z, damit man zum Original zurück kann
document.addEventListener(
  "keydown",
  (event) => {
    if (!lastUndoState) {
      return;
    }

    const isUndo =
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      event.key &&
      event.key.toLowerCase() === "z";

    if (!isUndo || !canRestoreUndo(lastUndoState)) {
      return;
    }

    event.preventDefault();
    restoreUndoState(lastUndoState);
    lastUndoState = null;
  },
  true
);

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "GET_CONTEXT_TEXT") {
    const context = resolveCurrentContext();
    lastResolvedContext = context?.ok ? context : null;

    return Promise.resolve({
      ok: !!context?.ok,
      text: context?.text ?? "",
      kind: context?.kind ?? null
    });
  }

  if (message.type === "REPLACE_LAST_CONTEXT_TEXT") {
    if (!lastResolvedContext) {
      return Promise.resolve({ ok: false, reason: "missing-context" });
    }

    const result = applyReplacement(lastResolvedContext, message.value ?? "");
    if (result.ok) {
      lastResolvedContext = null;
    }

    return Promise.resolve(result);
  }

  if (message.type === "SHOW_ERROR") {
    console.error(message.message);
    alert(message.message);
    return Promise.resolve({ ok: true });
  }

  if (message.type === "SHOW_MESSAGE") {
    console.log(message.message);
    alert(message.message);
    return Promise.resolve({ ok: true });
  }

  return undefined;
});

function resolveCurrentContext() {
  const target = getBestTarget();

  if (isTextControl(target)) {
    return buildControlContext(target);
  }

  if (isContentEditableElement(target)) {
    return buildContentEditableContext(target);
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed && selection.toString()) {
    const range = selection.getRangeAt(0).cloneRange();
    const root = getDomReplacementRoot(range);

    return {
      ok: true,
      kind: "dom-selection",
      text: selection.toString(),
      range,
      root,
      htmlBefore: root ? root.innerHTML : null
    };
  }

  return { ok: false };
}

function buildControlContext(element) {
  const value = element.value ?? "";
  const selectionStart = Number.isInteger(element.selectionStart) ? element.selectionStart : 0;
  const selectionEnd = Number.isInteger(element.selectionEnd) ? element.selectionEnd : selectionStart;

  if (selectionStart !== selectionEnd) {
    return {
      ok: true,
      kind: "control-selection",
      element,
      text: value.slice(selectionStart, selectionEnd),
      originalValue: value,
      selectionStart,
      selectionEnd
    };
  }

  return {
    ok: true,
    kind: "control-full",
    element,
    text: value,
    originalValue: value,
    selectionStart,
    selectionEnd
  };
}

function buildContentEditableContext(target) {
  const root = getContentEditableRoot(target);
  const selection = window.getSelection();

  if (
    root &&
    selection &&
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    root.contains(selection.anchorNode) &&
    root.contains(selection.focusNode)
  ) {
    return {
      ok: true,
      kind: "contenteditable-selection",
      root,
      text: selection.toString(),
      range: selection.getRangeAt(0).cloneRange(),
      htmlBefore: root.innerHTML
    };
  }

  if (!root) {
    return { ok: false };
  }

  return {
    ok: true,
    kind: "contenteditable-full",
    root,
    text: root.innerText ?? root.textContent ?? "",
    htmlBefore: root.innerHTML
  };
}

// FEATURE: Ersetzt nur die markierte Passage oder den gesamten Feldinhalt
function applyReplacement(context, replacementText) {
  try {
    switch (context.kind) {
      case "control-selection":
        return replaceInControlSelection(context, replacementText);
      case "control-full":
        return replaceInControlFull(context, replacementText);
      case "contenteditable-selection":
        return replaceInHtmlSelection(context, replacementText, true);
      case "contenteditable-full":
        return replaceInHtmlFull(context, replacementText, true);
      case "dom-selection":
        return replaceInHtmlSelection(context, replacementText, false);
      default:
        return { ok: false, reason: "unknown-kind" };
    }
  } catch (error) {
    console.error(error);
    alert("Fehler beim Zurückschreiben des Textes: " + error.message);
    return { ok: false, reason: "exception", message: error.message };
  }
}

function replaceInControlSelection(context, replacementText) {
  const { element, originalValue, selectionStart, selectionEnd } = context;

  if (!element || !element.isConnected) {
    return { ok: false, reason: "element-disconnected" };
  }

  lastUndoState = {
    kind: "control",
    element,
    valueBefore: originalValue,
    selectionStartBefore: selectionStart,
    selectionEndBefore: selectionEnd
  };

  element.focus();

  if (typeof element.setSelectionRange === "function") {
    element.setSelectionRange(selectionStart, selectionEnd);
  }

  // FEATURE: Fallback für Firefox/Textfelder robuster halten
  if (typeof element.setRangeText === "function") {
    element.setRangeText(String(replacementText), selectionStart, selectionEnd, "end");
  } else {
    element.value =
      originalValue.slice(0, selectionStart) +
      String(replacementText) +
      originalValue.slice(selectionEnd);

    const caret = selectionStart + String(replacementText).length;
    if (typeof element.setSelectionRange === "function") {
      element.setSelectionRange(caret, caret);
    }
  }

  dispatchEditableEvents(element);
  return { ok: true };
}

function replaceInControlFull(context, replacementText) {
  const { element, originalValue, selectionStart, selectionEnd } = context;

  if (!element || !element.isConnected) {
    return { ok: false, reason: "element-disconnected" };
  }

  lastUndoState = {
    kind: "control",
    element,
    valueBefore: originalValue,
    selectionStartBefore: selectionStart,
    selectionEndBefore: selectionEnd
  };

  element.focus();
  element.value = String(replacementText);

  const caret = String(replacementText).length;
  if (typeof element.setSelectionRange === "function") {
    element.setSelectionRange(caret, caret);
  }

  dispatchEditableEvents(element);
  return { ok: true };
}

function replaceInHtmlSelection(context, replacementText, dispatchEvents) {
  const { root, htmlBefore, range } = context;

  if (!root || !root.isConnected || !range) {
    return { ok: false, reason: "invalid-range" };
  }

  lastUndoState = {
    kind: "html",
    root,
    htmlBefore,
    dispatchEvents
  };

  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }

  range.deleteContents();

  const { fragment, lastNode } = createTextFragment(replacementText);
  range.insertNode(fragment);

  if (selection) {
    selection.removeAllRanges();

    if (lastNode && lastNode.parentNode) {
      const afterRange = document.createRange();
      afterRange.setStartAfter(lastNode);
      afterRange.collapse(true);
      selection.addRange(afterRange);
    }
  }

  if (dispatchEvents) {
    dispatchHtmlEditableEvents(root);
  }

  return { ok: true };
}

function replaceInHtmlFull(context, replacementText, dispatchEvents) {
  const { root, htmlBefore } = context;

  if (!root || !root.isConnected) {
    return { ok: false, reason: "root-disconnected" };
  }

  lastUndoState = {
    kind: "html",
    root,
    htmlBefore,
    dispatchEvents
  };

  root.innerHTML = "";
  root.appendChild(createTextFragment(replacementText).fragment);

  if (dispatchEvents) {
    dispatchHtmlEditableEvents(root);
  }

  return { ok: true };
}

function canRestoreUndo(state) {
  if (state.kind === "control") {
    return state.element && state.element.isConnected && document.activeElement === state.element;
  }

  if (state.kind === "html") {
    if (!state.root || !state.root.isConnected) {
      return false;
    }

    const active = document.activeElement;
    if (active && state.root.contains(active)) {
      return true;
    }

    return isSelectionInside(state.root) || active === document.body;
  }

  return false;
}

function restoreUndoState(state) {
  if (state.kind === "control") {
    state.element.focus();
    state.element.value = state.valueBefore;

    if (typeof state.element.setSelectionRange === "function") {
      state.element.setSelectionRange(state.selectionStartBefore, state.selectionEndBefore);
    }

    dispatchEditableEvents(state.element);
    return;
  }

  if (state.kind === "html") {
    state.root.innerHTML = state.htmlBefore;

    if (state.dispatchEvents) {
      dispatchHtmlEditableEvents(state.root);
    }
  }
}

function dispatchEditableEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchHtmlEditableEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function isTextControl(el) {
  if (!el || !el.tagName) {
    return false;
  }

  if (el.tagName === "TEXTAREA") {
    return true;
  }

  if (el.tagName !== "INPUT") {
    return false;
  }

  const type = (el.type || "text").toLowerCase();
  return ["text", "search", "url", "tel", "email", "password"].includes(type);
}

function isContentEditableElement(el) {
  return !!getContentEditableRoot(el);
}

function getContentEditableRoot(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  return el.closest("[contenteditable='true'], [contenteditable='plaintext-only']");
}

function getEditableTarget(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  if (isTextControl(el)) {
    return el;
  }

  return getContentEditableRoot(el);
}

function getBestTarget() {
  return (
    getEditableTarget(lastContextTarget) ||
    getEditableTarget(document.activeElement) ||
    getEditableTarget(lastFocusedEditable) ||
    null
  );
}

function getDomReplacementRoot(range) {
  const ancestor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (!ancestor) {
    return document.body;
  }

  return getContentEditableRoot(ancestor) || ancestor.parentElement || ancestor;
}

function isSelectionInside(root) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer);
}

function createTextFragment(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? "").split(/\r?\n/);
  let lastNode = null;

  lines.forEach((line, index) => {
    if (index > 0) {
      const br = document.createElement("br");
      fragment.appendChild(br);
      lastNode = br;
    }

    const textNode = document.createTextNode(line);
    fragment.appendChild(textNode);
    lastNode = textNode;
  });

  if (!lastNode) {
    lastNode = document.createTextNode("");
    fragment.appendChild(lastNode);
  }

  return { fragment, lastNode };
}
