const state = {
  selectedOrg: null,
  savedQueries: [],
  activeSavedQueryId: null,
  metadata: {
    objects: [],
    describe: {},
    selectedObject: null,
    filter: "",
  },
  queryHistory: {
    entries: [],
    objects: [],
    filter: "",
  },
  queryResult: {
    columns: [],
    records: [],
    queryFields: [],
  },
  complexWizard: {
    container: null,
    modal: null,
    initialized: false,
    steps: [],
    stepLabels: [],
    currentStep: 0,
    baseObject: null,
    baseLabel: "",
    fieldSelections: {},
    relationshipSelections: {},
    filters: [],
    templates: [],
    tasks: [],
    activeTemplateId: null,
    activeTaskId: null,
    lastQuery: "",
    running: false,
    limit: null,
  },
};

const STORAGE_PREFIX = "sfint";
const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}.settings`,
  savedQueries: `${STORAGE_PREFIX}.savedQueries`,
  selectedOrg: `${STORAGE_PREFIX}.selectedOrg`,
  queryDraft: `${STORAGE_PREFIX}.queryDraft`,
};

function getLocalStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch (error) {
    console.warn("LocalStorage is not available:", error);
    return null;
  }
}

function loadJSONFromStorage(key, fallback = null) {
  const storage = getLocalStorage();
  if (!storage) {
    return fallback;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.warn(`Unable to read localStorage key "${key}":`, error);
    return fallback;
  }
}

function saveJSONToStorage(key, value) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to persist localStorage key "${key}":`, error);
  }
}

function removeFromStorage(key) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(`Unable to remove localStorage key "${key}":`, error);
  }
}

function loadSettingsFromStorage() {
  const settings = loadJSONFromStorage(STORAGE_KEYS.settings, null);
  if (!settings || typeof settings !== "object") {
    return null;
  }
  const result = {};
  if (typeof settings.theme === "string" && settings.theme.trim()) {
    result.theme = settings.theme.trim();
  }
  if (typeof settings.language === "string" && settings.language.trim()) {
    result.language = settings.language.trim();
  }
  return Object.keys(result).length ? result : null;
}

function saveSettingsToStorage(settings) {
  if (!settings || typeof settings !== "object") {
    return;
  }
  const payload = {};
  if (typeof settings.theme === "string" && settings.theme.trim()) {
    payload.theme = settings.theme.trim();
  }
  if (typeof settings.language === "string" && settings.language.trim()) {
    payload.language = settings.language.trim();
  }
  if (Object.keys(payload).length) {
    saveJSONToStorage(STORAGE_KEYS.settings, payload);
  } else {
    removeFromStorage(STORAGE_KEYS.settings);
  }
}

function loadSavedQueriesFromStorage() {
  const stored = loadJSONFromStorage(STORAGE_KEYS.savedQueries, []);
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id.trim() : null,
      label: typeof item?.label === "string" ? item.label.trim() : "",
      soql: typeof item?.soql === "string" ? item.soql : "",
    }))
    .filter((item) => item.id && item.label && item.soql);
}

function saveSavedQueriesToStorage(queries) {
  if (!Array.isArray(queries)) {
    return;
  }
  const sanitized = queries
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id.trim() : null,
      label: typeof item?.label === "string" ? item.label.trim() : "",
      soql: typeof item?.soql === "string" ? item.soql : "",
    }))
    .filter((item) => item.id && item.label && item.soql);
  saveJSONToStorage(STORAGE_KEYS.savedQueries, sanitized);
}

function loadSelectedOrgFromStorage() {
  const stored = loadJSONFromStorage(STORAGE_KEYS.selectedOrg, null);
  if (!stored || typeof stored !== "object" || typeof stored.id !== "string") {
    return null;
  }
  return {
    id: stored.id,
    label: typeof stored.label === "string" ? stored.label : "",
  };
}

function saveSelectedOrgToStorage(orgId, label = "") {
  if (!orgId) {
    clearSelectedOrgFromStorage();
    return;
  }
  saveJSONToStorage(STORAGE_KEYS.selectedOrg, {
    id: orgId,
    label: label || "",
  });
}

function clearSelectedOrgFromStorage() {
  removeFromStorage(STORAGE_KEYS.selectedOrg);
}

function loadQueryDraftFromStorage() {
  const draft = loadJSONFromStorage(STORAGE_KEYS.queryDraft, null);
  return typeof draft === "string" ? draft : null;
}

function saveQueryDraftToStorage(value) {
  if (typeof value !== "string" || !value.trim()) {
    removeFromStorage(STORAGE_KEYS.queryDraft);
    return;
  }
  saveJSONToStorage(STORAGE_KEYS.queryDraft, value);
}

function clearQueryDraftFromStorage() {
  removeFromStorage(STORAGE_KEYS.queryDraft);
}

function applyLanguage(language) {
  if (!language || typeof language !== "string") {
    return;
  }
  document.documentElement?.setAttribute("lang", language);
  window.APP_LANGUAGE = language;
}

function applyTheme(theme) {
  if (!theme || typeof theme !== "string") {
    return;
  }
  const apply = () => {
    const body = document.body;
    if (!body) {
      return;
    }
    const themeClassPrefix = "theme-";
    body.classList.forEach((className) => {
      if (className.startsWith(themeClassPrefix) && className !== `${themeClassPrefix}${theme}`) {
        body.classList.remove(className);
      }
    });
    body.classList.add(`${themeClassPrefix}${theme}`);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
}

function applyStoredSettings() {
  const storedSettings = loadSettingsFromStorage();
  if (!storedSettings) {
    return;
  }
  if (storedSettings.language) {
    applyLanguage(storedSettings.language);
  }
  if (storedSettings.theme) {
    applyTheme(storedSettings.theme);
  }
}

applyStoredSettings();

const FROM_REGEX = /\bFROM\s+([a-zA-Z0-9_.]+)/i;
const SELECT_REGEX = /(\bSELECT\s+)([\s\S]*?)(\s+FROM\b)/i;

function escapeSelector(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return value.replace(/([#.;?+*~':"!^$\[\]()=>|/@\\])/g, "\\$1");
}

function selectHasOption(selectElement, value) {
  if (!selectElement || typeof value !== "string") {
    return false;
  }
  return Array.from(selectElement.options || []).some((option) => option.value === value);
}

const DEFAULT_QUERY = "SELECT Id\nFROM Account";
const KEYWORD_PATTERNS = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
];

function placeKeywordsOnNewLines(value = "") {
  if (!value) {
    return "";
  }
  let formatted = value.replace(/\r\n/g, "\n");
  KEYWORD_PATTERNS.forEach((pattern) => {
    const regex = new RegExp(`\\s*\\b${pattern.replace(/\s+/g, "\\s+")}\\b`, "gi");
    formatted = formatted.replace(regex, (match, offset) => {
      const prefix = offset === 0 ? "" : "\n";
      return `${prefix}${pattern}`;
    });
  });
  formatted = formatted.replace(/[ \t]+\n/g, "\n");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  return formatted;
}

function applyKeywordFormatting(textarea, options = {}) {
  if (!textarea) return;
  const preserveCursor = options?.preserveCursor ?? true;
  const originalValue = textarea.value || "";
  const formattedValue = placeKeywordsOnNewLines(originalValue);
  if (formattedValue === originalValue) {
    return;
  }
  if (!preserveCursor) {
    textarea.value = formattedValue;
    return;
  }
  const selectionStart = textarea.selectionStart ?? originalValue.length;
  const beforeCursor = originalValue.slice(0, selectionStart);
  const formattedBeforeCursor = placeKeywordsOnNewLines(beforeCursor);
  textarea.value = formattedValue;
  const cursorPosition = formattedBeforeCursor.length;
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }
}

function translate(key, params = {}) {
  const parts = key.split(".");
  let value = window.APP_TRANSLATIONS || {};
  for (const part of parts) {
    if (value && Object.prototype.hasOwnProperty.call(value, part)) {
      value = value[part];
    } else {
      value = null;
      break;
    }
  }
  if (typeof value !== "string") {
    return key;
  }
  return value.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return params[name];
    }
    return match;
  });
}

function showToast(message, type = "success") {
  const container = document.createElement("div");
  container.className = `toast align-items-center text-bg-${type} border-0 position-fixed bottom-0 end-0 m-3`;
  container.setAttribute("role", "alert");
  container.setAttribute("aria-live", "assertive");
  container.setAttribute("aria-atomic", "true");
  container.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  document.body.appendChild(container);
  const toast = new bootstrap.Toast(container);
  toast.show();
  container.addEventListener("hidden.bs.toast", () => container.remove());
}

function showElement(element, shouldShow) {
  if (!element) return;
  if (shouldShow) {
    element.classList.remove("d-none");
  } else {
    element.classList.add("d-none");
  }
}

function extractObjectNameFromQuery(query = "") {
  if (!query) return null;
  const match = query.match(FROM_REGEX);
  return match ? match[1] : null;
}

function getSelectFields(query = "") {
  if (!query) return [];
  const match = query.match(SELECT_REGEX);
  if (!match) return [];
  return match[2]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeFieldName(field = "") {
  let value = field.trim();
  if (!value) return "";
  const asParts = value.split(/\s+AS\s+/i);
  if (asParts.length > 1) {
    value = asParts[0].trim();
  } else {
    const tokens = value.split(/\s+/);
    if (tokens.length > 1) {
      value = tokens[0].trim();
    }
  }
  return value.toLowerCase();
}

function getNormalizedSelectFieldSet(query = "") {
  const fields = getSelectFields(query);
  const normalized = new Set();
  fields.forEach((field) => {
    const value = normalizeFieldName(field);
    if (value) {
      normalized.add(value);
    }
  });
  return normalized;
}

function getFieldSuggestionRank(field, prefix = "") {
  if (!prefix) {
    return 0;
  }
  const normalizedPrefix = prefix.toLowerCase();
  const name = field.name?.toLowerCase?.() ?? "";
  const label = field.label?.toLowerCase?.() ?? "";
  if (name.startsWith(normalizedPrefix) || label.startsWith(normalizedPrefix)) {
    return 0;
  }
  if (name.includes(normalizedPrefix) || label.includes(normalizedPrefix)) {
    return 1;
  }
  return 2;
}

function extractFieldPrefix(segment = "", options = {}) {
  const {
    splitOnComma = true,
    removeAlias = false,
    preferLastToken = true,
    separators = null,
  } = options;

  if (!segment) {
    return "";
  }

  let working = segment.replace(/\r?\n/g, " ");
  if (splitOnComma) {
    const parts = working.split(",");
    working = parts.pop() ?? "";
  }

  if (removeAlias) {
    const asIndex = working.toUpperCase().indexOf(" AS ");
    if (asIndex !== -1) {
      working = working.slice(0, asIndex);
    }
  }

  working = working.trim();
  if (!working) {
    return "";
  }

  const splitRegex = separators || /\s+/;
  const tokens = working.split(splitRegex).filter(Boolean);
  if (!tokens.length) {
    return "";
  }

  return preferLastToken ? tokens[tokens.length - 1] : tokens[0];
}

function getQueryContext(query = "", cursor = 0) {
  if (!query) {
    return { section: null, prefix: "" };
  }

  const normalizedCursor = Math.max(0, Math.min(Number(cursor) || 0, query.length));

  const selectRegex = /(\bSELECT\s+)([\s\S]*?)(\s+FROM\b)/gi;
  let match;

  while ((match = selectRegex.exec(query)) !== null) {
    const selectStart = match.index;
    const fieldsStart = selectStart + match[1].length;
    const fieldsEnd = fieldsStart + match[2].length;

    if (normalizedCursor < selectStart) {
      break;
    }

    if (normalizedCursor >= fieldsStart && normalizedCursor <= fieldsEnd) {
      const beforeCursor = query.slice(fieldsStart, normalizedCursor);
      const prefix = /[\s,]$/.test(beforeCursor.slice(-1))
        ? ""
        : extractFieldPrefix(beforeCursor, {
            removeAlias: true,
            preferLastToken: false,
            separators: /[\s(]+/,
          });

      return {
        section: "select",
        prefix,
      };
    }
  }

  const whereRegex = /(\bWHERE\s+)([\s\S]*?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\bFOR\s+UPDATE\b|\bRETURNING\b|\bWITH\b|$)/gi;

  while ((match = whereRegex.exec(query)) !== null) {
    const whereStart = match.index;
    const clauseStart = whereStart + match[1].length;
    const clauseEnd = clauseStart + match[2].length;

    if (normalizedCursor < clauseStart) {
      break;
    }

    if (normalizedCursor >= clauseStart && normalizedCursor <= clauseEnd) {
      const beforeCursor = query.slice(clauseStart, normalizedCursor);
      let prefix = /[\s,]$/.test(beforeCursor.slice(-1))
        ? ""
        : extractFieldPrefix(beforeCursor, {
            splitOnComma: false,
            separators: /[\s(),=<>!+\-*/]+/,
          });

      const keywordPrefixes = new Set([
        "AND",
        "OR",
        "LIKE",
        "IN",
        "NOT",
        "NULL",
        "WITH",
        "GROUP",
        "ORDER",
        "BY",
        "HAVING",
        "LIMIT",
        "OFFSET",
        "EXISTS",
      ]);
      if (prefix && keywordPrefixes.has(prefix.toUpperCase())) {
        prefix = "";
      }

      return {
        section: "where",
        prefix,
      };
    }
  }

  return { section: null, prefix: "" };
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const locale = window.APP_LANGUAGE || undefined;
  try {
    return date.toLocaleString(locale);
  } catch (error) {
    return date.toLocaleString();
  }
}

function refreshQueryEditorState() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const query = textarea.value || "";
  const objectName = extractObjectNameFromQuery(query);
  if (objectName && state.selectedOrg) {
    if (state.metadata.selectedObject !== objectName) {
      selectObject(objectName, { silent: true });
    } else if (!state.metadata.describe[objectName]) {
      loadFieldsForObject(objectName);
    }
  }
  updateFieldSuggestions();
}

function deriveColumnKey(field = "") {
  if (!field) return "";
  const trimmed = String(field).trim();
  if (!trimmed) return "";

  const asParts = trimmed.split(/\s+AS\s+/i);
  if (asParts.length > 1) {
    const alias = asParts.pop()?.trim();
    if (alias) {
      return alias.replace(/,+$/, "");
    }
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 1) {
    const alias = tokens[tokens.length - 1]?.trim();
    if (alias) {
      return alias.replace(/,+$/, "");
    }
  }

  return trimmed.replace(/,+$/, "");
}

function formatDisplayValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function hasQueryResults() {
  return Array.isArray(state.queryResult?.records) && state.queryResult.records.length > 0;
}

function bindResultActions(container) {
  const actionsContainer = container.querySelector(".query-result-actions");
  if (!actionsContainer) {
    return;
  }

  const actionHandlers = {
    "copy-csv": copyResultAsCsv,
    "copy-excel": copyResultAsExcel,
    "export-csv": exportResultAsCsv,
    "export-excel": exportResultAsExcel,
  };

  actionsContainer.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    const handler = actionHandlers[action];
    if (typeof handler === "function") {
      button.addEventListener("click", handler);
    }
  });
}

function copyResultAsCsv() {
  if (!hasQueryResults()) {
    showToast(translate("frontend.toast.no_results_available"), "info");
    return;
  }
  const content = createCsvContent(state.queryResult.columns, state.queryResult.records);
  copyToClipboard(content)
    .then(() => showToast(translate("frontend.toast.results_copy_csv_success"), "success"))
    .catch(() => showToast(translate("frontend.toast.results_copy_failed"), "danger"));
}

function copyResultAsExcel() {
  if (!hasQueryResults()) {
    showToast(translate("frontend.toast.no_results_available"), "info");
    return;
  }
  const content = createTsvContent(state.queryResult.columns, state.queryResult.records);
  copyToClipboard(content)
    .then(() => showToast(translate("frontend.toast.results_copy_excel_success"), "success"))
    .catch(() => showToast(translate("frontend.toast.results_copy_failed"), "danger"));
}

function exportResultAsCsv() {
  if (!hasQueryResults()) {
    showToast(translate("frontend.toast.no_results_available"), "info");
    return;
  }
  try {
    const content = createCsvContent(state.queryResult.columns, state.queryResult.records);
    downloadFile(content, "query-results.csv", "text/csv;charset=utf-8;");
    showToast(translate("frontend.toast.results_export_ready_csv"), "success");
  } catch (error) {
    showToast(translate("frontend.toast.results_export_failed"), "danger");
  }
}

function exportResultAsExcel() {
  if (!hasQueryResults()) {
    showToast(translate("frontend.toast.no_results_available"), "info");
    return;
  }
  try {
    const content = createTsvContent(state.queryResult.columns, state.queryResult.records);
    downloadFile(content, "query-results.xls", "application/vnd.ms-excel;charset=utf-8;");
    showToast(translate("frontend.toast.results_export_ready_excel"), "success");
  } catch (error) {
    showToast(translate("frontend.toast.results_export_failed"), "danger");
  }
}

function createCsvContent(columns, records) {
  const header = columns.map((column) => formatExportValue(column));
  const rows = [
    header,
    ...records.map((record) => columns.map((column) => formatExportValue(record[column]))),
  ].map((row) => row.map(escapeForCsv).join(","));
  return rows.join("\n");
}

function createTsvContent(columns, records) {
  const header = columns.map((column) => formatExportValue(column));
  const rows = [
    header,
    ...records.map((record) => columns.map((column) => formatExportValue(record[column]))),
  ].map((row) => row.map(escapeForTsv).join("\t"));
  return rows.join("\n");
}

function formatExportValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function escapeForCsv(value) {
  const needsEscaping = /[",\n\r]/.test(value);
  if (needsEscaping) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeForTsv(value) {
  return value.replace(/\t/g, " ");
}

function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      const selection = document.getSelection();
      const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (selectedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(selectedRange);
      }
      if (successful) {
        resolve();
      } else {
        reject(new Error("copy command unsuccessful"));
      }
    } catch (error) {
      reject(error);
    }
  });
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function bindQueryEditor() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const storedDraft = loadQueryDraftFromStorage();
  if (storedDraft && storedDraft.trim()) {
    textarea.value = storedDraft;
  } else if (!textarea.value.trim()) {
    textarea.value = DEFAULT_QUERY;
  }
  applyKeywordFormatting(textarea, { preserveCursor: false });
  saveQueryDraftToStorage(textarea.value);
  textarea.addEventListener("input", () => {
    applyKeywordFormatting(textarea);
    refreshQueryEditorState();
    saveQueryDraftToStorage(textarea.value);
  });
  textarea.addEventListener("click", () => updateFieldSuggestions());
  textarea.addEventListener("focus", () => updateFieldSuggestions());
  textarea.addEventListener("mouseup", () => updateFieldSuggestions());
  textarea.addEventListener("keyup", (event) => {
    const navigationKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ];
    if (navigationKeys.includes(event.key)) {
      updateFieldSuggestions();
    }
  });
  refreshQueryEditorState();
}

function addFieldToSelectClause(fieldName) {
  const textarea = document.getElementById("soql-query");
  if (!textarea || !fieldName) return;
  const query = textarea.value || "";
  const normalizedField = fieldName.trim().toLowerCase();
  if (!normalizedField) return;

  const container = document.getElementById("query-field-suggestions");
  const selectedFields = getNormalizedSelectFieldSet(query);
  if (selectedFields.has(normalizedField)) {
    const template = container?.dataset.labelFieldExists;
    if (template) {
      showToast(template.replace("{field}", fieldName), "info");
    } else {
      showToast(translate("toast.field_already_selected", { field: fieldName }), "info");
    }
    return;
  }

  const match = query.match(SELECT_REGEX);
  if (!match) {
    const fromMatch = query.match(FROM_REGEX);
    if (fromMatch) {
      const beforeFrom = query.slice(0, fromMatch.index);
      const afterFrom = query.slice(fromMatch.index);
      const needsSpaceBefore = beforeFrom.length > 0 && !/\s$/.test(beforeFrom);
      const prefix = needsSpaceBefore ? `${beforeFrom} ` : beforeFrom;
      const updatedQuery = `${prefix}SELECT ${fieldName} ${afterFrom}`;
      textarea.value = updatedQuery;
      textarea.focus();
      refreshQueryEditorState();
      return;
    }
    insertIntoQuery(fieldName);
    return;
  }

  const before = query.slice(0, match.index);
  const selectKeyword = match[1];
  const existingFields = match[2];
  const fromKeyword = match[3];
  const after = query.slice(match.index + match[0].length);

  const trimmedFields = existingFields.trim();
  const values = trimmedFields
    ? existingFields
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  values.push(fieldName);

  let newFieldsSegment;
  if (existingFields.includes("\n")) {
    const indentMatch = existingFields.match(/\n(\s*)\S/);
    const indent = indentMatch ? indentMatch[1] : "  ";
    newFieldsSegment = `\n${indent}${values.join(`,\n${indent}`)}\n`;
  } else {
    newFieldsSegment = values.join(", ");
  }

  const updatedQuery = `${before}${selectKeyword}${newFieldsSegment}${fromKeyword}${after}`;
  textarea.value = updatedQuery;
  textarea.focus();
  refreshQueryEditorState();
}

function handleFieldSuggestionClick(fieldName, section) {
  if (!fieldName) {
    return;
  }
  if (section === "where") {
    insertIntoQuery(fieldName);
    return;
  }
  addFieldToSelectClause(fieldName);
}

function updateFieldSuggestions() {
  const container = document.getElementById("query-field-suggestions");
  const list = document.getElementById("query-field-suggestions-list");
  if (!container || !list) return;
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const titleElement = container.querySelector(".suggestions-title");
  const query = textarea.value || "";
  const objectName = extractObjectNameFromQuery(query);
  const cursor = textarea.selectionStart ?? query.length;
  const context = getQueryContext(query, cursor);

  const updateTitle = (currentContext) => {
    if (!titleElement) return;
    const baseTitle = container.dataset.labelTitle || "";
    const parts = [];
    if (objectName) {
      parts.push(objectName);
    }
    if (currentContext?.section) {
      parts.push(currentContext.section.toUpperCase());
    }
    titleElement.textContent = parts.length ? `${baseTitle} (${parts.join(" • ")})` : baseTitle;
  };

  const hideSuggestions = (label) => {
    list.innerHTML = "";
    showElement(container, false);
    if (titleElement) {
      const fallback = container.dataset.labelTitle || "";
      titleElement.textContent = label ?? fallback;
    }
  };

  const showEmptyState = (label, currentContext) => {
    list.innerHTML = "";
    if (label) {
      const emptyMessage = document.createElement("span");
      emptyMessage.className = "text-muted small";
      emptyMessage.textContent = label;
      list.appendChild(emptyMessage);
    }
    updateTitle(currentContext);
    showElement(container, true);
  };

  if (!state.selectedOrg || !objectName || !context.section) {
    hideSuggestions(container.dataset.labelTitle || "");
    return;
  }

  const fields = state.metadata.describe[objectName]?.fields || [];
  if (!fields.length) {
    hideSuggestions(container.dataset.labelEmpty || container.dataset.labelTitle || "");
    return;
  }

  const normalizedPrefix = (context.prefix || "").trim().toLowerCase();
  let available = fields.slice();

  if (context.section === "select") {
    const selectedFields = getNormalizedSelectFieldSet(query);
    available = available.filter((field) => !selectedFields.has(field.name.toLowerCase()));
  }

  if (normalizedPrefix) {
    available = available.filter((field) => {
      const name = field.name?.toLowerCase?.() ?? "";
      const label = field.label?.toLowerCase?.() ?? "";
      return name.includes(normalizedPrefix) || label.includes(normalizedPrefix);
    });
  }

  if (!available.length) {
    showEmptyState(container.dataset.labelEmpty || container.dataset.labelTitle || "", context);
    return;
  }

  list.innerHTML = "";
  const suggestions = available
    .slice()
    .sort((a, b) => {
      const rankA = getFieldSuggestionRank(a, normalizedPrefix);
      const rankB = getFieldSuggestionRank(b, normalizedPrefix);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .slice(0, 12);

  suggestions.forEach((field) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm btn-outline-primary";
    button.textContent = field.name;
    if (field.label && field.label !== field.name) {
      button.title = field.label;
    }
    button.addEventListener("click", () => handleFieldSuggestionClick(field.name, context.section));
    list.appendChild(button);
  });

  updateTitle(context);

  showElement(container, true);
}

function handleOrgSelection(orgId, label = "") {
  const normalizedId = typeof orgId === "string" ? orgId.trim() : "";
  const normalizedLabel = typeof label === "string" ? label.trim() : "";

  if (!normalizedId) {
    state.selectedOrg = null;
    clearSelectedOrgFromStorage();
    const selectedOrgInput = document.getElementById("selected-org");
    if (selectedOrgInput) {
      selectedOrgInput.value = "";
    }
    document.querySelectorAll(".org-select").forEach((btn) => btn.classList.remove("active"));
    return;
  }

  state.selectedOrg = normalizedId;
  const selectedOrgInput = document.getElementById("selected-org");
  const button = document.querySelector(
    `.org-select[data-org="${escapeSelector(normalizedId)}"]`
  );
  const resolvedLabel =
    normalizedLabel ||
    button?.querySelector("strong")?.textContent.trim() ||
    button?.textContent.trim() ||
    normalizedLabel;
  if (selectedOrgInput) {
    selectedOrgInput.value = resolvedLabel;
  }
  document
    .querySelectorAll(".org-select")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.org === normalizedId));
  saveSelectedOrgToStorage(normalizedId, resolvedLabel);
  loadMetadataForSelectedOrg();
}

function bindOrgSelection() {
  document.querySelectorAll(".org-select").forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.querySelector("strong")?.textContent.trim() ?? button.textContent.trim();
      handleOrgSelection(button.dataset.org, label);
    });
  });
}

function restoreSelectedOrgSelection() {
  const orgButtons = document.querySelectorAll(".org-select");
  if (!orgButtons.length) {
    return;
  }
  const stored = loadSelectedOrgFromStorage();
  if (!stored?.id) {
    return;
  }
  const button = document.querySelector(`.org-select[data-org="${escapeSelector(stored.id)}"]`);
  if (!button) {
    clearSelectedOrgFromStorage();
    return;
  }
  const label = stored.label || button.querySelector("strong")?.textContent.trim() || button.textContent.trim();
  handleOrgSelection(stored.id, label);
}

function renderQueryResult(data) {
  const container = document.getElementById("query-result");
  if (!container) return;
  if (!data || !Array.isArray(data.records) || data.records.length === 0) {
    state.queryResult = { columns: [], records: [], queryFields: [] };
    container.innerHTML = `<p class="text-muted">${translate("query.no_records")}</p>`;
    return;
  }

  const records = data.records;
  const queryFields = Array.isArray(data.queryFields) ? data.queryFields : state.queryResult.queryFields;
  const allColumns = new Set();
  records.forEach((record) => {
    Object.keys(record || {}).forEach((key) => {
      if (key !== "attributes") {
        allColumns.add(key);
      }
    });
  });

  const remainingColumns = new Set(allColumns);
  const orderedColumns = [];

  if (Array.isArray(queryFields)) {
    queryFields.forEach((field) => {
      const key = deriveColumnKey(field);
      if (key && remainingColumns.has(key)) {
        orderedColumns.push(key);
        remainingColumns.delete(key);
      }
    });
  }

  remainingColumns.forEach((key) => {
    if (!orderedColumns.includes(key)) {
      orderedColumns.push(key);
    }
  });

  state.queryResult = {
    columns: orderedColumns,
    records,
    queryFields: queryFields || [],
  };

  const headerRow = orderedColumns.map((col) => `<th scope="col">${escapeHtml(col)}</th>`).join("");
  const rows = records
    .map((record) => {
      const cells = orderedColumns
        .map((col) => `<td>${escapeHtml(formatDisplayValue(record[col]))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="query-result-panel">
      <div class="query-result-actions">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-csv">
          ${translate("query.results.copy_csv")}
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-excel">
          ${translate("query.results.copy_excel")}
        </button>
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="export-csv">
          ${translate("query.results.export_csv")}
        </button>
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="export-excel">
          ${translate("query.results.export_excel")}
        </button>
      </div>
      <div class="query-result-table">
        <table class="table table-striped table-hover">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  bindResultActions(container);
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function insertIntoQuery(snippet) {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  const insertion = `${needsSpaceBefore ? " " : ""}${snippet}${needsSpaceAfter ? " " : ""}`;
  const newValue = `${before}${insertion}${after}`;
  textarea.value = newValue;
  const cursorPosition = before.length + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursorPosition, cursorPosition);
  applyKeywordFormatting(textarea);
  refreshQueryEditorState();
}

function addLimitClause(limitClause = "LIMIT 100") {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  applyKeywordFormatting(textarea, { preserveCursor: false });
  const clauseUpper = limitClause.toUpperCase();
  if (textarea.value.toUpperCase().includes(clauseUpper)) {
    showToast(translate("toast.clause_exists", { clause: limitClause }), "info");
    return;
  }
  const query = textarea.value || "";
  const offsetMatch = query.match(/\bOFFSET\b/i);
  const insertionIndex = offsetMatch ? offsetMatch.index : query.length;
  const before = query.slice(0, insertionIndex).replace(/\s+$/, "");
  const after = query.slice(insertionIndex).replace(/^\s*/, "");
  const segments = [];
  if (before) {
    segments.push(before);
  }
  segments.push(limitClause);
  if (after) {
    segments.push(after);
  }
  textarea.value = placeKeywordsOnNewLines(segments.join("\n"));
  const clauseIndex = textarea.value.indexOf(limitClause);
  const cursorPosition = clauseIndex >= 0 ? clauseIndex + limitClause.length : textarea.value.length;
  textarea.focus();
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }
  refreshQueryEditorState();
}

function addOrderByClause(orderByClause = "ORDER BY CreatedDate DESC") {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  applyKeywordFormatting(textarea, { preserveCursor: false });
  const clauseUpper = orderByClause.toUpperCase();
  if (textarea.value.toUpperCase().includes(clauseUpper)) {
    showToast(translate("toast.clause_exists", { clause: orderByClause }), "info");
    return;
  }
  const query = textarea.value || "";
  let insertionIndex = query.length;
  const limitMatch = query.match(/\bLIMIT\b/i);
  if (limitMatch && limitMatch.index < insertionIndex) {
    insertionIndex = limitMatch.index;
  }
  const offsetMatch = query.match(/\bOFFSET\b/i);
  if (offsetMatch && offsetMatch.index < insertionIndex) {
    insertionIndex = offsetMatch.index;
  }
  const before = query.slice(0, insertionIndex).replace(/\s+$/, "");
  const after = query.slice(insertionIndex).replace(/^\s*/, "");
  const segments = [];
  if (before) {
    segments.push(before);
  }
  segments.push(orderByClause);
  if (after) {
    segments.push(after);
  }
  textarea.value = placeKeywordsOnNewLines(segments.join("\n"));
  const clauseIndex = textarea.value.indexOf(orderByClause);
  const cursorPosition = clauseIndex >= 0 ? clauseIndex + orderByClause.length : textarea.value.length;
  textarea.focus();
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }
  refreshQueryEditorState();
}

function bindSnippetButtons() {
  const limitButton = document.getElementById("add-limit");
  if (limitButton) {
    limitButton.addEventListener("click", () => addLimitClause());
  }
  const orderByButton = document.getElementById("add-order-by");
  if (orderByButton) {
    orderByButton.addEventListener("click", () => addOrderByClause());
  }
}

function bindQueryForm() {
  const form = document.getElementById("query-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const queryInput = document.getElementById("soql-query");
    const query = queryInput?.value.trim() ?? "";
    if (!state.selectedOrg) {
      showToast(translate("toast.select_org"), "warning");
      return;
    }
    if (!query) {
      showToast(translate("toast.enter_query"), "warning");
      return;
    }

    const hasLimit = /\bLIMIT\b/i.test(query);
    const hasWhere = /\bWHERE\b/i.test(query);
    if (!hasLimit && !hasWhere) {
      showToast(translate("frontend.toast.query_without_limit_where"), "danger");
      return;
    }

    saveQueryDraftToStorage(queryInput?.value ?? query);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: state.selectedOrg, query }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || translate("toast.query_failed"));
      }
      const queryFields = getSelectFields(query);
      renderQueryResult({ ...data, queryFields });
      loadQueryHistory(state.queryHistory.filter);
    } catch (error) {
      const message = error instanceof Error ? error.message : translate("toast.query_failed");
      showToast(message, "danger");
    }
  });
}

async function loadSavedQueries() {
  try {
    const response = await fetch("/api/saved-queries");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("toast.saved_queries_load_failed"));
    }
    state.savedQueries = Array.isArray(data) ? data : [];
    renderSavedQueries();
    saveSavedQueriesToStorage(state.savedQueries);
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.saved_queries_load_failed");
    showToast(message, "danger");
  }
}

function renderSavedQueries() {
  const list = document.getElementById("saved-queries-list");
  const empty = document.getElementById("saved-queries-empty");
  if (!list || !empty) return;
  list.innerHTML = "";
  if (!state.savedQueries.length) {
    showElement(empty, true);
    return;
  }
  showElement(empty, false);

  const loadLabel = list.dataset.labelLoad || translate("saved_queries.load");
  const deleteLabel = list.dataset.labelDelete || translate("saved_queries.delete");

  state.savedQueries
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, window.APP_LANGUAGE || undefined, { sensitivity: "base" }))
    .forEach((saved) => {
      const item = document.createElement("div");
      item.className = "list-group-item d-flex justify-content-between align-items-start gap-2";
      item.setAttribute("role", "button");
      if (state.activeSavedQueryId === saved.id) {
        item.classList.add("active");
      }

      const textContainer = document.createElement("div");
      textContainer.className = "flex-grow-1";
      const title = document.createElement("div");
      title.className = "fw-semibold";
      title.textContent = saved.label;
      textContainer.appendChild(title);
      const preview = document.createElement("div");
      preview.className = "small text-muted text-truncate";
      preview.textContent = saved.soql;
      textContainer.appendChild(preview);
      item.appendChild(textContainer);

      const actions = document.createElement("div");
      actions.className = "btn-group btn-group-sm align-self-center";
      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "btn btn-outline-primary";
      loadButton.textContent = loadLabel;
      loadButton.addEventListener("click", (event) => {
        event.stopPropagation();
        loadSavedQueryIntoForm(saved);
      });
      actions.appendChild(loadButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-outline-danger";
      deleteButton.textContent = deleteLabel;
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          const response = await fetch(`/api/saved-queries/${encodeURIComponent(saved.id)}`, {
            method: "DELETE",
          });
          if (!response.ok && response.status !== 204) {
            throw new Error(translate("toast.saved_query_delete_failed"));
          }
          state.savedQueries = state.savedQueries.filter((itemSaved) => itemSaved.id !== saved.id);
          saveSavedQueriesToStorage(state.savedQueries);
          if (state.activeSavedQueryId === saved.id) {
            resetSavedQueryForm();
          } else {
            renderSavedQueries();
          }
          showToast(translate("toast.saved_query_deleted"), "info");
        } catch (error) {
          const message = error instanceof Error ? error.message : translate("toast.saved_query_delete_failed");
          showToast(message, "danger");
        }
      });
      actions.appendChild(deleteButton);
      item.appendChild(actions);

      item.addEventListener("click", () => loadSavedQueryIntoForm(saved));

      list.appendChild(item);
    });
}

function resetSavedQueryForm() {
  const form = document.getElementById("saved-query-form");
  if (!form) return;
  form.reset();
  state.activeSavedQueryId = null;
  const idInput = document.getElementById("saved-query-id");
  if (idInput) {
    idInput.value = "";
  }
  const submitButton = document.getElementById("saved-query-submit");
  if (submitButton) {
    submitButton.textContent = submitButton.dataset.labelSave || submitButton.textContent;
  }
  renderSavedQueries();
}

function loadSavedQueryIntoForm(saved) {
  const nameInput = document.getElementById("saved-query-name");
  const idInput = document.getElementById("saved-query-id");
  const queryInput = document.getElementById("soql-query");
  if (!nameInput || !idInput || !queryInput) return;
  state.activeSavedQueryId = saved.id;
  nameInput.value = saved.label;
  idInput.value = saved.id;
  queryInput.value = saved.soql;
  applyKeywordFormatting(queryInput, { preserveCursor: false });
  saveQueryDraftToStorage(queryInput.value);
  queryInput.focus();
  refreshQueryEditorState();
  const submitButton = document.getElementById("saved-query-submit");
  if (submitButton) {
    submitButton.textContent = submitButton.dataset.labelUpdate || submitButton.textContent;
  }
  renderSavedQueries();
  showToast(translate("toast.saved_query_loaded"), "info");
}

function bindSavedQueryForm() {
  const form = document.getElementById("saved-query-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = document.getElementById("saved-query-name");
    const queryInput = document.getElementById("soql-query");
    const idInput = document.getElementById("saved-query-id");
    if (!nameInput || !queryInput || !idInput) return;
    const label = nameInput.value.trim();
    const soql = queryInput.value.trim();
    if (!soql) {
      showToast(translate("toast.enter_query"), "warning");
      return;
    }
    if (!label) {
      showToast(translate("toast.enter_saved_query_name"), "warning");
      return;
    }
    try {
      const payload = {
        id: idInput.value.trim() || null,
        label,
        soql,
      };
      const response = await fetch("/api/saved-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || translate("toast.saved_query_save_failed"));
      }
      const existingIndex = state.savedQueries.findIndex((item) => item.id === data.id);
      if (existingIndex >= 0) {
        state.savedQueries[existingIndex] = data;
      } else {
        state.savedQueries.push(data);
      }
      saveSavedQueriesToStorage(state.savedQueries);
      state.activeSavedQueryId = data.id;
      idInput.value = data.id;
      const submitButton = document.getElementById("saved-query-submit");
      if (submitButton) {
        submitButton.textContent = submitButton.dataset.labelUpdate || submitButton.textContent;
      }
      renderSavedQueries();
      showToast(translate("toast.saved_query_saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : translate("toast.saved_query_save_failed");
      showToast(message, "danger");
    }
  });

  const resetButton = document.getElementById("saved-query-reset");
  if (resetButton) {
    resetButton.addEventListener("click", () => resetSavedQueryForm());
  }
}

function initializeSavedQueries() {
  resetSavedQueryForm();
  bindSavedQueryForm();
  const storedQueries = loadSavedQueriesFromStorage();
  if (Array.isArray(storedQueries)) {
    state.savedQueries = storedQueries;
    renderSavedQueries();
  }
  loadSavedQueries();
}

function initializeAppSettings() {
  const form = document.getElementById("app-settings-form");
  if (!form) {
    return;
  }

  const languageSelect = form.querySelector("#language");
  const themeSelect = form.querySelector("#theme");
  const storedSettings = loadSettingsFromStorage();

  if (storedSettings?.language && languageSelect && selectHasOption(languageSelect, storedSettings.language)) {
    languageSelect.value = storedSettings.language;
    applyLanguage(storedSettings.language);
  }

  if (storedSettings?.theme && themeSelect && selectHasOption(themeSelect, storedSettings.theme)) {
    themeSelect.value = storedSettings.theme;
    applyTheme(storedSettings.theme);
  }

  form.addEventListener("submit", () => {
    saveSettingsToStorage({
      language: languageSelect?.value ?? null,
      theme: themeSelect?.value ?? null,
    });
  });

  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      const settings = loadSettingsFromStorage() || {};
      settings.language = languageSelect.value;
      if (themeSelect?.value && !settings.theme) {
        settings.theme = themeSelect.value;
      }
      saveSettingsToStorage(settings);
      applyLanguage(languageSelect.value);
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      const settings = loadSettingsFromStorage() || {};
      settings.theme = themeSelect.value;
      if (languageSelect?.value && !settings.language) {
        settings.language = languageSelect.value;
      }
      saveSettingsToStorage(settings);
      applyTheme(themeSelect.value);
    });
  }
}

function renderQueryHistory() {
  const list = document.getElementById("query-history-list");
  const empty = document.getElementById("query-history-empty");
  const filter = document.getElementById("query-history-filter");
  if (!list || !empty || !filter) return;

  const allLabel = filter.dataset.labelAll || translate("history.filter_all");
  filter.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = allLabel;
  filter.appendChild(defaultOption);

  state.queryHistory.objects
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((objectName) => {
      const option = document.createElement("option");
      option.value = objectName;
      option.textContent = objectName;
      filter.appendChild(option);
    });

  filter.value = state.queryHistory.filter || "";

  list.innerHTML = "";
  if (!state.queryHistory.entries.length) {
    showElement(empty, true);
    return;
  }

  showElement(empty, false);
  const unknownLabel = list.dataset.labelUnknown || translate("history.object_unknown");
  const orgLabel = list.dataset.labelOrg || translate("history.org_label");

  state.queryHistory.entries.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "list-group-item list-group-item-action text-start";

    const header = document.createElement("div");
    header.className = "d-flex justify-content-between align-items-center mb-1";

    const badge = document.createElement("span");
    badge.className = "badge bg-light text-dark";
    badge.textContent = entry.object_name || unknownLabel;
    header.appendChild(badge);

    const timeEl = document.createElement("span");
    timeEl.className = "small text-muted";
    timeEl.textContent = formatTimestamp(entry.executed_at);
    header.appendChild(timeEl);
    item.appendChild(header);

    const orgInfo = document.createElement("div");
    orgInfo.className = "small text-muted";
    orgInfo.textContent = `${orgLabel}: ${entry.org_id}`;
    item.appendChild(orgInfo);

    const queryText = document.createElement("code");
    queryText.className = "d-block text-break mt-1";
    queryText.textContent = entry.soql;
    item.appendChild(queryText);

    item.addEventListener("click", () => {
      const textarea = document.getElementById("soql-query");
      if (!textarea) return;
      textarea.value = entry.soql;
      applyKeywordFormatting(textarea, { preserveCursor: false });
      textarea.focus();
      refreshQueryEditorState();
    });

    list.appendChild(item);
  });
}

async function loadQueryHistory(objectName = state.queryHistory.filter) {
  const params = new URLSearchParams();
  if (objectName) {
    params.set("object", objectName);
  }
  try {
    const response = await fetch(`/api/query-history${params.toString() ? `?${params.toString()}` : ""}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("toast.query_history_load_failed"));
    }
    state.queryHistory.entries = Array.isArray(data.entries) ? data.entries : [];
    state.queryHistory.objects = Array.isArray(data.objects) ? data.objects : [];
    state.queryHistory.filter = data.selected_object || objectName || "";
    renderQueryHistory();
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.query_history_load_failed");
    showToast(message, "danger");
  }
}

function initializeQueryHistory() {
  const filter = document.getElementById("query-history-filter");
  if (filter) {
    filter.addEventListener("change", (event) => {
      const value = event.target.value;
      state.queryHistory.filter = value;
      loadQueryHistory(value);
    });
  }
  renderQueryHistory();
  loadQueryHistory();
}

function clearMetadata() {
  state.metadata.objects = [];
  state.metadata.describe = {};
  state.metadata.selectedObject = null;
  state.metadata.filter = "";
  renderObjectList();
  renderFieldList([]);
  updateFieldSuggestions();
}

async function loadMetadataForSelectedOrg() {
  const searchInput = document.getElementById("object-search");
  if (searchInput) {
    searchInput.value = "";
    searchInput.disabled = !state.selectedOrg;
  }
  state.metadata.filter = "";
  state.metadata.objects = [];
  state.metadata.describe = {};
  state.metadata.selectedObject = null;
  renderObjectList();
  renderFieldList([]);
  if (!state.selectedOrg) {
    return;
  }
  const loading = document.getElementById("objects-loading");
  showElement(loading, true);
  showElement(document.getElementById("objects-empty"), false);
  try {
    const response = await fetch(`/api/sobjects?org_id=${encodeURIComponent(state.selectedOrg)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("toast.metadata_fetch_failed"));
    }
    state.metadata.objects = Array.isArray(data) ? data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.metadata_fetch_failed");
    showToast(message, "danger");
  } finally {
    showElement(loading, false);
    renderObjectList();
  }
}

function renderObjectList(filterText = state.metadata.filter) {
  const list = document.getElementById("object-list");
  const empty = document.getElementById("objects-empty");
  if (!list || !empty) return;
  const normalizedFilter = (filterText || "").toLowerCase();
  state.metadata.filter = filterText || "";
  list.innerHTML = "";
  if (!state.metadata.objects.length) {
    showElement(empty, true);
    return;
  }

  const objects = state.metadata.objects.filter((item) => {
    if (!normalizedFilter) return true;
    const nameMatch = item.name?.toLowerCase().includes(normalizedFilter);
    const labelMatch = item.label?.toLowerCase().includes(normalizedFilter);
    return nameMatch || labelMatch;
  });

  if (!objects.length) {
    showElement(empty, true);
    return;
  }

  showElement(empty, false);

  objects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach((object) => {
      const item = document.createElement("div");
      item.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-2";
      item.setAttribute("role", "button");
      if (state.metadata.selectedObject === object.name) {
        item.classList.add("active");
      }
      item.addEventListener("click", () => selectObject(object.name));

      const textContainer = document.createElement("div");
      textContainer.className = "flex-grow-1";
      const nameEl = document.createElement("div");
      nameEl.className = "fw-semibold";
      nameEl.textContent = object.name;
      textContainer.appendChild(nameEl);
      if (object.label && object.label !== object.name) {
        const labelEl = document.createElement("div");
        labelEl.className = "small text-muted";
        labelEl.textContent = object.label;
        textContainer.appendChild(labelEl);
      }
      item.appendChild(textContainer);

      const insertButton = document.createElement("button");
      insertButton.type = "button";
      insertButton.className = "btn btn-sm btn-outline-secondary align-self-center";
      insertButton.textContent = translate("autocomplete.insert");
      insertButton.addEventListener("click", (event) => {
        event.stopPropagation();
        insertIntoQuery(object.name);
      });
      item.appendChild(insertButton);

      list.appendChild(item);
    });
}

function selectObject(objectName, options = {}) {
  if (!objectName) return;
  const silent = options?.silent ?? false;
  if (state.metadata.selectedObject === objectName) {
    if (!state.metadata.describe[objectName]) {
      loadFieldsForObject(objectName);
    } else if (!silent) {
      updateFieldSuggestions();
    }
    return;
  }
  state.metadata.selectedObject = objectName;
  renderObjectList();
  renderFieldList([]);
  loadFieldsForObject(objectName);
  if (!silent) {
    updateFieldSuggestions();
  }
}

async function loadFieldsForObject(objectName) {
  if (!state.selectedOrg || !objectName) return;
  const existing = state.metadata.describe[objectName];
  if (existing?.fields) {
    renderFieldList(existing.fields);
    return;
  }
  const loading = document.getElementById("fields-loading");
  showElement(loading, true);
  showElement(document.getElementById("fields-empty"), false);
  try {
    const response = await fetch(
      `/api/sobjects/${encodeURIComponent(objectName)}/fields?org_id=${encodeURIComponent(state.selectedOrg)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("toast.fields_fetch_failed"));
    }
    const describe = Array.isArray(data)
      ? { fields: data, childRelationships: [] }
      : {
          fields: Array.isArray(data.fields) ? data.fields : [],
          childRelationships: Array.isArray(data.childRelationships)
            ? data.childRelationships.filter(
                (item) => item && item.relationshipName && item.childSObject
              )
            : [],
          label: data.label || "",
          name: data.name || objectName,
        };
    state.metadata.describe[objectName] = describe;
    renderFieldList(describe.fields);
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.fields_fetch_failed");
    showToast(message, "danger");
    renderFieldList([]);
  } finally {
    showElement(loading, false);
  }
}

function renderFieldList(fields = null) {
  const list = document.getElementById("field-list");
  const empty = document.getElementById("fields-empty");
  if (!list || !empty) return;
  let values = fields;
  if (values === null) {
    values = state.metadata.selectedObject
      ? state.metadata.describe[state.metadata.selectedObject]?.fields || []
      : [];
  }
  list.innerHTML = "";
  if (!values.length) {
    showElement(empty, true);
    return;
  }
  showElement(empty, false);

  values
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach((field) => {
      const item = document.createElement("div");
      item.className = "list-group-item list-group-item-action";
      item.setAttribute("role", "button");

      const row = document.createElement("div");
      row.className = "d-flex justify-content-between align-items-center gap-2";

      const textContainer = document.createElement("div");
      textContainer.className = "flex-grow-1";
      const nameEl = document.createElement("div");
      nameEl.className = "fw-semibold";
      nameEl.textContent = field.name;
      textContainer.appendChild(nameEl);
      if (field.label && field.label !== field.name) {
        const labelEl = document.createElement("div");
        labelEl.className = "small text-muted";
        labelEl.textContent = field.label;
        textContainer.appendChild(labelEl);
      }
      row.appendChild(textContainer);

      if (field.type) {
        const badge = document.createElement("span");
        badge.className = "badge bg-light text-dark";
        badge.textContent = field.type;
        row.appendChild(badge);
      }

      item.appendChild(row);
      item.addEventListener("click", () => insertIntoQuery(field.name));
      list.appendChild(item);
    });

  updateFieldSuggestions();
}

function getComplexWizardContainer() {
  return state.complexWizard.container || document.getElementById("query-main-complex");
}

function parseDatasetJSON(element, key, fallback = []) {
  if (!element) {
    return fallback;
  }
  const raw = element.dataset?.[key];
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.warn("Unable to parse dataset", key, error);
    return fallback;
  }
}

function getWizardDatasetValue(key, fallback = "") {
  const container = getComplexWizardContainer();
  if (!container) {
    return fallback;
  }
  return container.dataset?.[key] ?? fallback;
}

function ensureWizardFieldSet(objectName) {
  if (!objectName) {
    return new Set();
  }
  if (!state.complexWizard.fieldSelections[objectName]) {
    state.complexWizard.fieldSelections[objectName] = new Set();
  }
  return state.complexWizard.fieldSelections[objectName];
}

function ensureWizardRelationship(name, defaults = {}) {
  if (!name) {
    return null;
  }
  if (!state.complexWizard.relationshipSelections[name]) {
    state.complexWizard.relationshipSelections[name] = {
      type: defaults.type || "child",
      objectName: defaults.objectName || null,
      relationshipName: defaults.relationshipName || name,
      label: defaults.label || name,
      joinField: defaults.joinField || null,
      viaField: defaults.viaField || null,
      fields: new Set(Array.isArray(defaults.fields) ? defaults.fields : []),
    };
  }
  const relationship = state.complexWizard.relationshipSelections[name];
  if (defaults.objectName) {
    relationship.objectName = defaults.objectName;
  }
  if (defaults.label) {
    relationship.label = defaults.label;
  }
  if (defaults.joinField) {
    relationship.joinField = defaults.joinField;
  }
  if (defaults.viaField) {
    relationship.viaField = defaults.viaField;
  }
  if (Array.isArray(defaults.fields)) {
    defaults.fields.forEach((field) => relationship.fields.add(field));
  }
  if (defaults.type) {
    relationship.type = defaults.type;
  }
  if (defaults.relationshipName) {
    relationship.relationshipName = defaults.relationshipName;
  }
  return relationship;
}

function clearWizardSelections() {
  state.complexWizard.fieldSelections = {};
  state.complexWizard.relationshipSelections = {};
  state.complexWizard.filters = [];
  state.complexWizard.limit = null;
  state.complexWizard.activeTemplateId = null;
  state.complexWizard.activeTaskId = null;
}

function resetComplexWizardState(options = {}) {
  const preserveLastQuery = options?.preserveLastQuery ?? false;
  const lastQuery = state.complexWizard.lastQuery;
  state.complexWizard.baseObject = null;
  state.complexWizard.baseLabel = "";
  state.complexWizard.currentStep = 0;
  state.complexWizard.running = false;
  clearWizardSelections();
  if (!preserveLastQuery) {
    state.complexWizard.lastQuery = "";
  } else {
    state.complexWizard.lastQuery = lastQuery || "";
  }
}

function getObjectLabel(objectName) {
  if (!objectName) {
    return "";
  }
  const match = state.metadata.objects.find((item) => item.name === objectName);
  if (!match) {
    return objectName;
  }
  return match.label && match.label !== objectName ? match.label : objectName;
}

function getDescribeForObject(objectName) {
  if (!objectName) {
    return null;
  }
  return state.metadata.describe[objectName] || null;
}

async function ensureDescribeForObject(objectName) {
  if (!objectName) {
    return null;
  }
  if (!state.metadata.describe[objectName]) {
    await loadFieldsForObject(objectName);
  }
  return state.metadata.describe[objectName] || null;
}

function getRelationshipOptionsForBase() {
  const baseObject = state.complexWizard.baseObject;
  const describe = getDescribeForObject(baseObject);
  const parents = [];
  const children = [];
  if (!describe) {
    return { parents, children };
  }
  describe.fields.forEach((field) => {
    if (field && field.relationshipName && Array.isArray(field.referenceTo) && field.referenceTo.length) {
      parents.push({
        relationshipName: field.relationshipName,
        fieldName: field.name,
        label: field.label || field.relationshipName,
        referenceTo: field.referenceTo,
      });
    }
  });
  if (Array.isArray(describe.childRelationships)) {
    describe.childRelationships.forEach((rel) => {
      if (rel && rel.relationshipName && rel.childSObject) {
        children.push({
          relationshipName: rel.relationshipName,
          childSObject: rel.childSObject,
          fieldName: rel.field || null,
        });
      }
    });
  }
  parents.sort((a, b) => a.relationshipName.localeCompare(b.relationshipName, undefined, { sensitivity: "base" }));
  children.sort((a, b) => a.relationshipName.localeCompare(b.relationshipName, undefined, { sensitivity: "base" }));
  return { parents, children };
}

function getWizardAvailableFieldPaths() {
  const result = [];
  const baseObject = state.complexWizard.baseObject;
  const baseDescribe = getDescribeForObject(baseObject);
  if (baseObject && baseDescribe?.fields) {
    baseDescribe.fields.forEach((field) => {
      if (field?.name) {
        result.push(field.name);
      }
    });
  }
  Object.values(state.complexWizard.relationshipSelections).forEach((relationship) => {
    if (!relationship?.relationshipName) {
      return;
    }
    const relatedDescribe = getDescribeForObject(relationship.objectName);
    if (relationship.type === "parent" && relatedDescribe?.fields) {
      relatedDescribe.fields.forEach((field) => {
        if (field?.name) {
          result.push(`${relationship.relationshipName}.${field.name}`);
        }
      });
    }
    if (relationship.type === "child" && relatedDescribe?.fields) {
      relatedDescribe.fields.forEach((field) => {
        if (field?.name) {
          result.push(`${relationship.relationshipName}.${field.name}`);
        }
      });
    }
  });
  return Array.from(new Set(result));
}

function buildComplexWizardQuery() {
  const baseObject = state.complexWizard.baseObject;
  if (!baseObject) {
    return "";
  }
  const selectFields = new Set();
  const baseFields = Array.from(ensureWizardFieldSet(baseObject));
  baseFields.forEach((field) => {
    if (field) {
      selectFields.add(field);
    }
  });
  const childQueries = [];
  Object.values(state.complexWizard.relationshipSelections).forEach((relationship) => {
    if (!relationship?.relationshipName) {
      return;
    }
    const fields = Array.from(relationship.fields || []);
    if (relationship.type === "parent") {
      fields.forEach((field) => {
        if (field) {
          selectFields.add(`${relationship.relationshipName}.${field}`);
        }
      });
    } else if (relationship.type === "child" && fields.length) {
      const inner = fields.join(", ");
      childQueries.push(`(SELECT ${inner} FROM ${relationship.relationshipName})`);
    }
  });
  if (!selectFields.size && !childQueries.length) {
    selectFields.add("Id");
  }
  const selectSegments = Array.from(selectFields);
  const allSegments = selectSegments.concat(childQueries);
  let soql = `SELECT ${allSegments.join(", ")}`;
  soql += ` FROM ${baseObject}`;
  const activeFilters = (state.complexWizard.filters || []).filter((filter) => filter?.field && filter?.operator);
  if (activeFilters.length) {
    const filterStrings = activeFilters
      .map((filter) => {
        const value = filter.value || "";
        return `${filter.field} ${filter.operator} ${value}`.trim();
      })
      .filter(Boolean);
    if (filterStrings.length) {
      soql += ` WHERE ${filterStrings.join(" AND ")}`;
    }
  }
  if (state.complexWizard.limit) {
    soql += ` LIMIT ${state.complexWizard.limit}`;
  }
  return placeKeywordsOnNewLines(soql.trim());
}

function updateComplexWizardPreview() {
  const previewElement = document.getElementById("complex-wizard-preview-query");
  const copyButton = document.getElementById("complex-wizard-copy");
  const query = buildComplexWizardQuery();
  const fallback = getWizardDatasetValue("lastEmpty", "");
  if (previewElement) {
    previewElement.textContent = query || fallback;
  }
  if (copyButton) {
    copyButton.disabled = !query;
  }
  return query;
}

function renderComplexWizardStepper() {
  const stepper = document.getElementById("complex-wizard-stepper");
  if (!stepper) {
    return;
  }
  stepper.innerHTML = "";
  const steps = state.complexWizard.steps || [];
  steps.forEach((stepId, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "step-pill btn btn-sm";
    if (index === state.complexWizard.currentStep) {
      pill.classList.add("active");
    }
    const label = state.complexWizard.stepLabels?.[index] || `${translate("complex.step_label")} ${index + 1}`;
    pill.textContent = `${index + 1}. ${label}`;
    pill.addEventListener("click", () => {
      state.complexWizard.currentStep = index;
      renderComplexWizard();
    });
    stepper.appendChild(pill);
  });
}

function renderComplexWizardIntentStep(container) {
  const intentCard = document.createElement("div");
  intentCard.className = "wizard-card";

  const baseLabel = document.createElement("label");
  baseLabel.className = "form-label";
  baseLabel.setAttribute("for", "complex-wizard-base-object");
  baseLabel.textContent = translate("complex.intent_base_label");
  intentCard.appendChild(baseLabel);

  const baseInput = document.createElement("input");
  baseInput.type = "search";
  baseInput.id = "complex-wizard-base-object";
  baseInput.className = "form-control";
  baseInput.placeholder = translate("complex.intent_base_placeholder");
  if (state.complexWizard.baseObject) {
    baseInput.value = state.complexWizard.baseObject;
  }
  intentCard.appendChild(baseInput);

  const datalist = document.createElement("datalist");
  datalist.id = "complex-wizard-base-objects";
  state.metadata.objects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach((object) => {
      const option = document.createElement("option");
      option.value = object.name;
      if (object.label && object.label !== object.name) {
        option.label = object.label;
      }
      datalist.appendChild(option);
    });
  intentCard.appendChild(datalist);
  baseInput.setAttribute("list", datalist.id);

  baseInput.addEventListener("change", async (event) => {
    const value = event.target.value.trim();
    if (!value) {
      state.complexWizard.baseObject = null;
      state.complexWizard.baseLabel = "";
      state.complexWizard.fieldSelections = {};
      renderComplexWizard();
      return;
    }
    state.complexWizard.baseObject = value;
    state.complexWizard.baseLabel = getObjectLabel(value);
    ensureWizardFieldSet(value);
    await ensureDescribeForObject(value);
    renderComplexWizard();
  });

  const hint = document.createElement("p");
  hint.className = "form-text";
  hint.textContent = translate("complex.intent_hint");
  intentCard.appendChild(hint);

  container.appendChild(intentCard);

  if (state.complexWizard.templates.length) {
    const templateCard = document.createElement("div");
    templateCard.className = "wizard-card";

    const templateLabel = document.createElement("label");
    templateLabel.className = "form-label";
    templateLabel.setAttribute("for", "complex-wizard-template");
    templateLabel.textContent = translate("complex.intent_template_label");
    templateCard.appendChild(templateLabel);

    const templateSelect = document.createElement("select");
    templateSelect.id = "complex-wizard-template";
    templateSelect.className = "form-select mb-3";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = translate("complex.intent_template_placeholder");
    templateSelect.appendChild(emptyOption);
    state.complexWizard.templates.forEach((template) => {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.label;
      if (template.description) {
        option.dataset.description = template.description;
      }
      templateSelect.appendChild(option);
    });
    templateSelect.value = state.complexWizard.activeTemplateId || "";
    templateSelect.addEventListener("change", async (event) => {
      const selectedId = event.target.value;
      if (!selectedId) {
        state.complexWizard.activeTemplateId = null;
        return;
      }
      const template = state.complexWizard.templates.find((item) => item.id === selectedId);
      if (template?.preset) {
        await applyComplexPreset(template.preset, { templateId: selectedId });
        state.complexWizard.currentStep = 1;
        renderComplexWizard();
      }
    });
    templateCard.appendChild(templateSelect);

    const templateNote = document.createElement("p");
    templateNote.className = "text-muted small mb-0";
    templateNote.textContent = translate("complex.intent_template_hint");
    templateCard.appendChild(templateNote);

    container.appendChild(templateCard);
  }

  if (state.complexWizard.tasks.length) {
    const taskCard = document.createElement("div");
    taskCard.className = "wizard-card";

    const taskLabel = document.createElement("label");
    taskLabel.className = "form-label";
    taskLabel.setAttribute("for", "complex-wizard-task");
    taskLabel.textContent = translate("complex.intent_task_label");
    taskCard.appendChild(taskLabel);

    const taskSelect = document.createElement("select");
    taskSelect.id = "complex-wizard-task";
    taskSelect.className = "form-select";
    const emptyTask = document.createElement("option");
    emptyTask.value = "";
    emptyTask.textContent = translate("complex.intent_task_placeholder");
    taskSelect.appendChild(emptyTask);
    state.complexWizard.tasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = task.label;
      taskSelect.appendChild(option);
    });
    taskSelect.value = state.complexWizard.activeTaskId || "";
    taskSelect.addEventListener("change", async (event) => {
      const taskId = event.target.value;
      if (!taskId) {
        state.complexWizard.activeTaskId = null;
        return;
      }
      const task = state.complexWizard.tasks.find((item) => item.id === taskId);
      if (task?.preset) {
        await applyComplexPreset(task.preset, { taskId });
        state.complexWizard.currentStep = 1;
        renderComplexWizard();
      }
    });
    taskCard.appendChild(taskSelect);

    container.appendChild(taskCard);
  }
}

function renderComplexWizardFieldsStep(container) {
  if (!state.complexWizard.baseObject) {
    const alert = document.createElement("div");
    alert.className = "alert alert-warning";
    alert.textContent = translate("complex.intent_missing_base");
    container.appendChild(alert);
    return;
  }
  const describe = getDescribeForObject(state.complexWizard.baseObject);
  if (!describe) {
    const loading = document.createElement("div");
    loading.className = "text-muted";
    loading.textContent = translate("complex.loading_metadata");
    container.appendChild(loading);
    return;
  }
  const selection = ensureWizardFieldSet(state.complexWizard.baseObject);

  const card = document.createElement("div");
  card.className = "wizard-card";

  const header = document.createElement("div");
  header.className = "d-flex justify-content-between align-items-center mb-3";
  const title = document.createElement("h6");
  title.className = "mb-0";
  title.textContent = translate("complex.fields_title", { object: state.complexWizard.baseLabel || state.complexWizard.baseObject });
  header.appendChild(title);

  const counter = document.createElement("span");
  counter.className = "text-muted small";
  const updateCounter = () => {
    counter.textContent = translate("complex.fields_selected", { count: selection.size });
  };
  updateCounter();
  header.appendChild(counter);
  card.appendChild(header);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "form-control mb-3";
  search.placeholder = translate("complex.fields_search_placeholder");
  card.appendChild(search);

  const grid = document.createElement("div");
  grid.className = "complex-wizard-field-grid";
  card.appendChild(grid);

  const renderFields = (filterText = "") => {
    grid.innerHTML = "";
    const normalized = filterText.trim().toLowerCase();
    const fields = describe.fields.filter((field) => {
      if (!normalized) {
        return true;
      }
      return (
        field.name.toLowerCase().includes(normalized) ||
        (field.label && field.label.toLowerCase().includes(normalized))
      );
    });
    if (!fields.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = translate("complex.fields_none_available");
      grid.appendChild(empty);
      return;
    }
    fields.forEach((field) => {
      const wrapper = document.createElement("label");
      wrapper.className = "form-check";
      if (selection.has(field.name)) {
        wrapper.classList.add("active");
      }
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-check-input";
      checkbox.checked = selection.has(field.name);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selection.add(field.name);
          wrapper.classList.add("active");
        } else {
          selection.delete(field.name);
          wrapper.classList.remove("active");
        }
        updateCounter();
        updateComplexWizardPreview();
      });
      wrapper.appendChild(checkbox);

      const body = document.createElement("span");
      body.className = "ms-2";
      body.innerHTML = `<strong>${escapeHtml(field.name)}</strong>${field.label && field.label !== field.name ? `<br><small class="text-muted">${escapeHtml(field.label)}</small>` : ""}`;
      wrapper.appendChild(body);

      grid.appendChild(wrapper);
    });
  };

  search.addEventListener("input", (event) => {
    renderFields(event.target.value || "");
  });

  renderFields();
  container.appendChild(card);
}

function renderComplexWizardRelationshipsStep(container) {
  if (!state.complexWizard.baseObject) {
    const alert = document.createElement("div");
    alert.className = "alert alert-warning";
    alert.textContent = translate("complex.intent_missing_base");
    container.appendChild(alert);
    return;
  }
  const describe = getDescribeForObject(state.complexWizard.baseObject);
  if (!describe) {
    const loading = document.createElement("div");
    loading.className = "text-muted";
    loading.textContent = translate("complex.loading_metadata");
    container.appendChild(loading);
    return;
  }

  const { parents, children } = getRelationshipOptionsForBase();

  const listsWrapper = document.createElement("div");
  listsWrapper.className = "row g-4";

  const parentCol = document.createElement("div");
  parentCol.className = "col-12 col-lg-6";
  const parentCard = document.createElement("div");
  parentCard.className = "wizard-card";
  const parentTitle = document.createElement("h6");
  parentTitle.className = "mb-3";
  parentTitle.textContent = translate("complex.relationships_parents");
  parentCard.appendChild(parentTitle);
  const parentList = document.createElement("div");
  parentList.className = "complex-wizard-relationship-list";
  if (!parents.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.textContent = translate("complex.relationships_no_parents");
    parentCard.appendChild(empty);
  } else {
    parents.forEach((parent) => {
      const item = document.createElement("div");
      item.className = "relationship-item";
      const selected = state.complexWizard.relationshipSelections[parent.relationshipName];
      if (selected) {
        item.classList.add("active");
      }
      const title = document.createElement("div");
      title.className = "fw-semibold";
      title.textContent = parent.label || parent.relationshipName;
      item.appendChild(title);
      const subtitle = document.createElement("div");
      subtitle.className = "text-muted small mb-2";
      subtitle.textContent = translate("complex.relationships_parent_details", {
        object: parent.referenceTo[0],
      });
      item.appendChild(subtitle);
      const action = document.createElement("button");
      action.type = "button";
      action.className = selected ? "btn btn-sm btn-outline-danger" : "btn btn-sm btn-outline-primary";
      action.textContent = selected ? translate("complex.relationships_remove") : translate("complex.relationships_add");
      action.addEventListener("click", async () => {
        if (state.complexWizard.relationshipSelections[parent.relationshipName]) {
          delete state.complexWizard.relationshipSelections[parent.relationshipName];
          renderComplexWizard();
          return;
        }
        const targetObject = parent.referenceTo[0];
        ensureWizardRelationship(parent.relationshipName, {
          type: "parent",
          objectName: targetObject,
          label: parent.label || parent.relationshipName,
          joinField: parent.fieldName,
          relationshipName: parent.relationshipName,
        });
        await ensureDescribeForObject(targetObject);
        renderComplexWizard();
      });
      item.appendChild(action);
      parentList.appendChild(item);
    });
    parentCard.appendChild(parentList);
  }
  parentCol.appendChild(parentCard);
  listsWrapper.appendChild(parentCol);

  const childCol = document.createElement("div");
  childCol.className = "col-12 col-lg-6";
  const childCard = document.createElement("div");
  childCard.className = "wizard-card";
  const childTitle = document.createElement("h6");
  childTitle.className = "mb-3";
  childTitle.textContent = translate("complex.relationships_children");
  childCard.appendChild(childTitle);
  const childList = document.createElement("div");
  childList.className = "complex-wizard-relationship-list";
  if (!children.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.textContent = translate("complex.relationships_no_children");
    childCard.appendChild(empty);
  } else {
    children.forEach((child) => {
      const item = document.createElement("div");
      item.className = "relationship-item";
      const selected = state.complexWizard.relationshipSelections[child.relationshipName];
      if (selected) {
        item.classList.add("active");
      }
      const title = document.createElement("div");
      title.className = "fw-semibold";
      title.textContent = child.relationshipName;
      item.appendChild(title);
      const subtitle = document.createElement("div");
      subtitle.className = "text-muted small mb-2";
      subtitle.textContent = translate("complex.relationships_child_details", { object: child.childSObject });
      item.appendChild(subtitle);
      const action = document.createElement("button");
      action.type = "button";
      action.className = selected ? "btn btn-sm btn-outline-danger" : "btn btn-sm btn-outline-primary";
      action.textContent = selected ? translate("complex.relationships_remove") : translate("complex.relationships_add");
      action.addEventListener("click", async () => {
        if (state.complexWizard.relationshipSelections[child.relationshipName]) {
          delete state.complexWizard.relationshipSelections[child.relationshipName];
          renderComplexWizard();
          return;
        }
        ensureWizardRelationship(child.relationshipName, {
          type: "child",
          objectName: child.childSObject,
          label: child.relationshipName,
          relationshipName: child.relationshipName,
          joinField: child.fieldName,
        });
        await ensureDescribeForObject(child.childSObject);
        renderComplexWizard();
      });
      item.appendChild(action);
      childList.appendChild(item);
    });
    childCard.appendChild(childList);
  }
  childCol.appendChild(childCard);
  listsWrapper.appendChild(childCol);

  container.appendChild(listsWrapper);

  const selectedRelationships = Object.values(state.complexWizard.relationshipSelections);
  if (!selectedRelationships.length) {
    const note = document.createElement("p");
    note.className = "text-muted mt-3";
    note.textContent = translate("complex.relationships_selected_empty");
    container.appendChild(note);
    return;
  }

  selectedRelationships.forEach((relationship) => {
    const card = document.createElement("div");
    card.className = "wizard-card mt-3";

    const header = document.createElement("div");
    header.className = "d-flex justify-content-between align-items-center mb-3";
    const title = document.createElement("h6");
    title.className = "mb-0";
    title.textContent = translate("complex.relationships_selected_title", {
      relationship: relationship.label || relationship.relationshipName,
      object: relationship.objectName,
    });
    header.appendChild(title);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-sm btn-outline-danger";
    remove.textContent = translate("complex.relationships_remove");
    remove.addEventListener("click", () => {
      delete state.complexWizard.relationshipSelections[relationship.relationshipName];
      renderComplexWizard();
    });
    header.appendChild(remove);
    card.appendChild(header);

    const describeRelated = getDescribeForObject(relationship.objectName);
    if (!describeRelated?.fields) {
      const loading = document.createElement("p");
      loading.className = "text-muted";
      loading.textContent = translate("complex.loading_metadata");
      card.appendChild(loading);
    } else {
      const select = document.createElement("select");
      select.className = "form-select";
      select.multiple = true;
      describeRelated.fields
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .forEach((field) => {
          const option = document.createElement("option");
          option.value = field.name;
          option.textContent = field.label && field.label !== field.name ? `${field.name} (${field.label})` : field.name;
          option.selected = relationship.fields.has(field.name);
          select.appendChild(option);
        });
      select.addEventListener("change", () => {
        const values = Array.from(select.selectedOptions).map((option) => option.value);
        relationship.fields = new Set(values);
        updateComplexWizardPreview();
      });
      const helper = document.createElement("p");
      helper.className = "text-muted small mt-2";
      helper.textContent = translate("complex.relationships_selected_help");
      card.appendChild(select);
      card.appendChild(helper);
    }

    container.appendChild(card);
  });
}

function renderComplexWizardReviewStep(container) {
  if (!state.complexWizard.baseObject) {
    const alert = document.createElement("div");
    alert.className = "alert alert-warning";
    alert.textContent = translate("complex.intent_missing_base");
    container.appendChild(alert);
    return;
  }

  const filtersCard = document.createElement("div");
  filtersCard.className = "wizard-card";
  const filtersHeader = document.createElement("div");
  filtersHeader.className = "d-flex justify-content-between align-items-center mb-3";
  const filtersTitle = document.createElement("h6");
  filtersTitle.className = "mb-0";
  filtersTitle.textContent = translate("complex.filters_title");
  filtersHeader.appendChild(filtersTitle);
  const addFilter = document.createElement("button");
  addFilter.type = "button";
  addFilter.className = "btn btn-sm btn-outline-primary";
  addFilter.textContent = translate("complex.filters_add");
  addFilter.addEventListener("click", () => {
    state.complexWizard.filters.push({ field: "", operator: "=", value: "" });
    renderComplexWizard();
  });
  filtersHeader.appendChild(addFilter);
  filtersCard.appendChild(filtersHeader);

  const filtersList = document.createElement("div");
  filtersList.className = "d-flex flex-column gap-3";
  const fieldSuggestions = getWizardAvailableFieldPaths();
  const datalist = document.createElement("datalist");
  datalist.id = "complex-wizard-filter-fields";
  fieldSuggestions.forEach((field) => {
    const option = document.createElement("option");
    option.value = field;
    datalist.appendChild(option);
  });
  filtersCard.appendChild(datalist);

  const operators = ["=", "!=", "LIKE", "IN", "NOT IN", ">", "<", ">=", "<="];

  if (!state.complexWizard.filters.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.textContent = translate("complex.filters_empty");
    filtersList.appendChild(empty);
  } else {
    state.complexWizard.filters.forEach((filter, index) => {
      const row = document.createElement("div");
      row.className = "row g-2 align-items-center";

      const fieldCol = document.createElement("div");
      fieldCol.className = "col-12 col-lg-4";
      const fieldInput = document.createElement("input");
      fieldInput.type = "search";
      fieldInput.className = "form-control";
      fieldInput.placeholder = translate("complex.filters_field");
      fieldInput.value = filter.field || "";
      fieldInput.setAttribute("list", datalist.id);
      fieldInput.addEventListener("change", (event) => {
        filter.field = event.target.value.trim();
        updateComplexWizardPreview();
      });
      fieldCol.appendChild(fieldInput);
      row.appendChild(fieldCol);

      const operatorCol = document.createElement("div");
      operatorCol.className = "col-6 col-lg-2";
      const operatorSelect = document.createElement("select");
      operatorSelect.className = "form-select";
      operators.forEach((op) => {
        const option = document.createElement("option");
        option.value = op;
        option.textContent = op;
        if (filter.operator === op) {
          option.selected = true;
        }
        operatorSelect.appendChild(option);
      });
      operatorSelect.addEventListener("change", (event) => {
        filter.operator = event.target.value;
        updateComplexWizardPreview();
      });
      operatorCol.appendChild(operatorSelect);
      row.appendChild(operatorCol);

      const valueCol = document.createElement("div");
      valueCol.className = "col-6 col-lg-4";
      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "form-control";
      valueInput.placeholder = translate("complex.filters_value");
      valueInput.value = filter.value || "";
      valueInput.addEventListener("change", (event) => {
        filter.value = event.target.value;
        updateComplexWizardPreview();
      });
      valueCol.appendChild(valueInput);
      row.appendChild(valueCol);

      const removeCol = document.createElement("div");
      removeCol.className = "col-12 col-lg-2 d-grid";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-outline-danger";
      removeButton.textContent = translate("complex.filters_remove");
      removeButton.addEventListener("click", () => {
        state.complexWizard.filters.splice(index, 1);
        renderComplexWizard();
      });
      removeCol.appendChild(removeButton);
      row.appendChild(removeCol);

      filtersList.appendChild(row);
    });
  }

  filtersCard.appendChild(filtersList);

  const limitGroup = document.createElement("div");
  limitGroup.className = "mt-3";
  const limitLabel = document.createElement("label");
  limitLabel.className = "form-label";
  limitLabel.setAttribute("for", "complex-wizard-limit");
  limitLabel.textContent = translate("complex.filters_limit");
  limitGroup.appendChild(limitLabel);
  const limitInput = document.createElement("input");
  limitInput.type = "number";
  limitInput.min = "1";
  limitInput.id = "complex-wizard-limit";
  limitInput.className = "form-control";
  if (state.complexWizard.limit) {
    limitInput.value = state.complexWizard.limit;
  }
  limitInput.addEventListener("change", (event) => {
    const value = parseInt(event.target.value, 10);
    state.complexWizard.limit = Number.isFinite(value) && value > 0 ? value : null;
    updateComplexWizardPreview();
  });
  limitGroup.appendChild(limitInput);
  filtersCard.appendChild(limitGroup);

  container.appendChild(filtersCard);

  const summaryCard = document.createElement("div");
  summaryCard.className = "wizard-card mt-3";
  const summaryTitle = document.createElement("h6");
  summaryTitle.className = "mb-3";
  summaryTitle.textContent = translate("complex.review_summary");
  summaryCard.appendChild(summaryTitle);

  const list = document.createElement("ul");
  list.className = "list-unstyled mb-0";

  const baseItem = document.createElement("li");
  baseItem.innerHTML = `<strong>${translate("complex.review_base")}:</strong> ${escapeHtml(state.complexWizard.baseLabel || state.complexWizard.baseObject)}`;
  list.appendChild(baseItem);

  const baseFields = Array.from(ensureWizardFieldSet(state.complexWizard.baseObject));
  const fieldsItem = document.createElement("li");
  fieldsItem.innerHTML = `<strong>${translate("complex.review_fields")}:</strong> ${baseFields.length ? escapeHtml(baseFields.join(", ")) : translate("complex.review_fields_empty")}`;
  list.appendChild(fieldsItem);

  const relItem = document.createElement("li");
  if (Object.keys(state.complexWizard.relationshipSelections).length) {
    const parts = Object.values(state.complexWizard.relationshipSelections).map((rel) => {
      const fields = Array.from(rel.fields || []);
      return `${rel.relationshipName}${fields.length ? ` (${fields.join(", ")})` : ""}`;
    });
    relItem.innerHTML = `<strong>${translate("complex.review_relationships")}:</strong> ${escapeHtml(parts.join(", "))}`;
  } else {
    relItem.innerHTML = `<strong>${translate("complex.review_relationships")}:</strong> ${translate("complex.relationships_selected_empty")}`;
  }
  list.appendChild(relItem);

  const filterSummary = document.createElement("li");
  if (state.complexWizard.filters.length) {
    const parts = state.complexWizard.filters
      .filter((filter) => filter.field && filter.operator)
      .map((filter) => `${filter.field} ${filter.operator} ${filter.value || ""}`);
    filterSummary.innerHTML = `<strong>${translate("complex.review_filters")}:</strong> ${escapeHtml(parts.join(" AND "))}`;
  } else {
    filterSummary.innerHTML = `<strong>${translate("complex.review_filters")}:</strong> ${translate("complex.review_no_filters")}`;
  }
  list.appendChild(filterSummary);

  summaryCard.appendChild(list);

  const ready = document.createElement("p");
  ready.className = "text-muted small mt-3 mb-0";
  ready.textContent = translate("complex.review_ready");
  summaryCard.appendChild(ready);

  container.appendChild(summaryCard);
}

function updateComplexWizardButtons() {
  const backButton = document.getElementById("complex-wizard-back");
  const nextButton = document.getElementById("complex-wizard-next");
  const insertButton = document.getElementById("complex-wizard-insert");
  const runButton = document.getElementById("complex-wizard-run");
  const refreshButton = document.getElementById("complex-wizard-refresh");

  if (backButton) {
    backButton.disabled = state.complexWizard.currentStep === 0;
    backButton.textContent = getWizardDatasetValue("backButton", translate("complex.back_button"));
  }

  const nextLabel = getWizardDatasetValue("nextButton", translate("complex.next_button"));
  const doneLabel = getWizardDatasetValue("doneButton", translate("complex.done_button"));
  const isLastStep = state.complexWizard.currentStep >= (state.complexWizard.steps?.length || 1) - 1;
  let canAdvance = true;
  const stepId = state.complexWizard.steps?.[state.complexWizard.currentStep];
  if (stepId === "intent") {
    canAdvance = Boolean(state.complexWizard.baseObject);
  } else if (stepId === "fields") {
    canAdvance = ensureWizardFieldSet(state.complexWizard.baseObject).size > 0;
  }

  if (nextButton) {
    nextButton.textContent = isLastStep ? doneLabel : nextLabel;
    nextButton.disabled = !canAdvance;
  }

  const query = buildComplexWizardQuery();
  const hasQuery = Boolean(query);
  const runLabel = getWizardDatasetValue("runButton", translate("complex.run_button"));
  const insertLabel = getWizardDatasetValue("insertButton", translate("complex.insert_button"));
  if (insertButton) {
    insertButton.textContent = insertLabel;
    insertButton.disabled = !hasQuery;
  }
  if (runButton) {
    runButton.textContent = runLabel;
    runButton.disabled = !hasQuery || !state.selectedOrg || state.complexWizard.running;
  }
  if (refreshButton) {
    refreshButton.textContent = getWizardDatasetValue("refreshButton", translate("complex.refresh_button"));
    refreshButton.disabled = !state.complexWizard.lastQuery;
  }
}

function renderComplexWizard() {
  renderComplexWizardStepper();
  const content = document.getElementById("complex-wizard-content");
  if (!content) {
    return;
  }
  content.innerHTML = "";
  const stepId = state.complexWizard.steps?.[state.complexWizard.currentStep] || "intent";
  const section = document.createElement("div");
  section.className = "wizard-section";
  if (stepId === "intent") {
    renderComplexWizardIntentStep(section);
  } else if (stepId === "fields") {
    renderComplexWizardFieldsStep(section);
  } else if (stepId === "relationships") {
    renderComplexWizardRelationshipsStep(section);
  } else {
    renderComplexWizardReviewStep(section);
  }
  content.appendChild(section);
  updateComplexWizardButtons();
  updateComplexWizardPreview();
}

function updateComplexWizardLatestQuery(query, options = {}) {
  const lastQuery = query || "";
  state.complexWizard.lastQuery = lastQuery;
  const lastQueryElement = document.getElementById("complex-wizard-last-query");
  const fallback = getWizardDatasetValue("lastEmpty", "");
  if (lastQueryElement) {
    lastQueryElement.textContent = lastQuery || fallback;
  }
  const helper = document.getElementById("complex-wizard-last-helper");
  const helperText = getWizardDatasetValue("lastHelper", "");
  if (helper) {
    if (lastQuery && helperText) {
      helper.textContent = helperText;
      helper.classList.remove("d-none");
    } else if (helperText) {
      helper.textContent = helperText;
      helper.classList.remove("d-none");
    } else {
      helper.classList.add("d-none");
    }
  }
  const insertLatest = document.getElementById("complex-wizard-insert-latest");
  if (insertLatest) {
    insertLatest.disabled = !lastQuery;
    insertLatest.textContent = getWizardDatasetValue("insertLatest", insertLatest.textContent);
  }
  const resumeButton = document.getElementById("complex-wizard-resume");
  if (resumeButton) {
    resumeButton.disabled = !lastQuery && !state.complexWizard.baseObject;
    resumeButton.textContent = getWizardDatasetValue("resumeLabel", resumeButton.textContent);
    if (!lastQuery && !state.complexWizard.baseObject) {
      resumeButton.title = getWizardDatasetValue("resumeDisabled", "");
    } else {
      resumeButton.removeAttribute("title");
    }
  }
  if (!options?.silent) {
    renderComplexPresetLists();
  }
}

function renderComplexPresetLists() {
  const templateContainer = document.getElementById("complex-wizard-templates");
  const taskContainer = document.getElementById("complex-wizard-tasks");
  if (templateContainer) {
    templateContainer.innerHTML = "";
    if (!state.complexWizard.templates.length) {
      const empty = document.createElement("div");
      empty.className = "text-muted small";
      empty.textContent = translate("complex.templates_empty");
      templateContainer.appendChild(empty);
    } else {
      state.complexWizard.templates.forEach((template) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "list-group-item list-group-item-action text-start";
        if (state.complexWizard.activeTemplateId === template.id) {
          item.classList.add("active");
        }
        const title = document.createElement("div");
        title.className = "fw-semibold";
        title.textContent = template.label;
        item.appendChild(title);
        if (template.description) {
          const description = document.createElement("div");
          description.className = "text-muted small";
          description.textContent = template.description;
          item.appendChild(description);
        }
        item.addEventListener("click", async () => {
          if (template.preset) {
            await applyComplexPreset(template.preset, { templateId: template.id });
            openComplexWizard({ startStep: 1 });
          }
        });
        templateContainer.appendChild(item);
      });
    }
  }
  if (taskContainer) {
    taskContainer.innerHTML = "";
    if (!state.complexWizard.tasks.length) {
      const empty = document.createElement("div");
      empty.className = "text-muted small";
      empty.textContent = translate("complex.tasks_empty");
      taskContainer.appendChild(empty);
    } else {
      state.complexWizard.tasks.forEach((task) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "list-group-item list-group-item-action text-start";
        if (state.complexWizard.activeTaskId === task.id) {
          item.classList.add("active");
        }
        const title = document.createElement("div");
        title.className = "fw-semibold";
        title.textContent = task.label;
        item.appendChild(title);
        if (task.description) {
          const description = document.createElement("div");
          description.className = "text-muted small";
          description.textContent = task.description;
          item.appendChild(description);
        }
        item.addEventListener("click", async () => {
          if (task.preset) {
            await applyComplexPreset(task.preset, { taskId: task.id });
            openComplexWizard({ startStep: 1 });
          }
        });
        taskContainer.appendChild(item);
      });
    }
  }
}

async function applyComplexPreset(preset, options = {}) {
  if (!preset) {
    return;
  }
  const preserveLastQuery = options?.preserveLastQuery ?? true;
  resetComplexWizardState({ preserveLastQuery });
  if (options.templateId) {
    state.complexWizard.activeTemplateId = options.templateId;
  }
  if (options.taskId) {
    state.complexWizard.activeTaskId = options.taskId;
  }
  if (preset.base) {
    state.complexWizard.baseObject = preset.base;
    state.complexWizard.baseLabel = getObjectLabel(preset.base);
    ensureWizardFieldSet(preset.base);
    await ensureDescribeForObject(preset.base);
  }
  if (Array.isArray(preset.fields)) {
    const baseSet = ensureWizardFieldSet(state.complexWizard.baseObject);
    preset.fields.forEach((field) => {
      if (field) {
        baseSet.add(field);
      }
    });
  }
  if (Array.isArray(preset.parentRelationships)) {
    for (const parent of preset.parentRelationships) {
      if (!parent?.relationship) {
        continue;
      }
      const referenceObject = parent.object || parent.referenceTo || null;
      ensureWizardRelationship(parent.relationship, {
        type: "parent",
        objectName: referenceObject,
        label: parent.label || parent.relationship,
        relationshipName: parent.relationship,
        fields: Array.isArray(parent.fields) ? parent.fields : [],
      });
      if (referenceObject) {
        await ensureDescribeForObject(referenceObject);
      }
    }
  }
  if (Array.isArray(preset.childRelationships)) {
    for (const child of preset.childRelationships) {
      if (!child?.relationship) {
        continue;
      }
      ensureWizardRelationship(child.relationship, {
        type: "child",
        objectName: child.object || child.childSObject || null,
        label: child.label || child.relationship,
        relationshipName: child.relationship,
        fields: Array.isArray(child.fields) ? child.fields : [],
      });
      const target = child.object || child.childSObject;
      if (target) {
        await ensureDescribeForObject(target);
      }
    }
  }
  if (Array.isArray(preset.filters)) {
    state.complexWizard.filters = preset.filters.map((filter) => ({
      field: filter.field || "",
      operator: filter.operator || "=",
      value: filter.value || "",
    }));
  }
  if (preset.limit) {
    state.complexWizard.limit = preset.limit;
  }
  renderComplexPresetLists();
}

function renderComplexWizardDataPreview(data) {
  const container = document.getElementById("complex-wizard-data-preview");
  if (!container) {
    return;
  }
  if (!data || !Array.isArray(data.records) || !data.records.length) {
    container.textContent = translate("complex.data_empty");
    return;
  }
  const columns = new Set();
  data.records.forEach((record) => {
    Object.keys(record || {}).forEach((key) => {
      if (key !== "attributes") {
        columns.add(key);
      }
    });
  });
  const orderedColumns = Array.from(columns);
  const table = document.createElement("table");
  table.className = "table table-sm table-striped";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  orderedColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  data.records.slice(0, 50).forEach((record) => {
    const row = document.createElement("tr");
    orderedColumns.forEach((column) => {
      const cell = document.createElement("td");
      cell.textContent = formatDisplayValue(record[column]);
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

async function runComplexWizardQuery() {
  const query = buildComplexWizardQuery();
  if (!query) {
    showToast(translate("complex.toast_no_query"), "warning");
    return;
  }
  if (!state.selectedOrg) {
    showToast(translate("toast.select_org"), "warning");
    return;
  }
  const dataPreview = document.getElementById("complex-wizard-data-preview");
  if (dataPreview) {
    dataPreview.textContent = translate("complex.running_query");
  }
  state.complexWizard.running = true;
  updateComplexWizardButtons();
  try {
    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: state.selectedOrg, query }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("complex.toast_run_failed"));
    }
    renderComplexWizardDataPreview(data);
    updateComplexWizardLatestQuery(query, { silent: true });
    showToast(translate("complex.toast_run_success"));
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("complex.toast_run_failed");
    if (dataPreview) {
      dataPreview.textContent = message;
    }
    showToast(message, "danger");
  } finally {
    state.complexWizard.running = false;
    updateComplexWizardButtons();
  }
}

function insertComplexWizardQuery() {
  const query = buildComplexWizardQuery();
  if (!query) {
    showToast(translate("complex.toast_no_query"), "warning");
    return;
  }
  const textarea = document.getElementById("soql-query");
  if (!textarea) {
    showToast(translate("complex.toast_no_editor"), "danger");
    return;
  }
  textarea.value = query;
  applyKeywordFormatting(textarea, { preserveCursor: false });
  refreshQueryEditorState();
  updateComplexWizardLatestQuery(query);
  showToast(translate("complex.toast_inserted"));
}

async function openComplexWizard(options = {}) {
  if (!state.selectedOrg) {
    showToast(translate("toast.select_org"), "warning");
    return;
  }
  const modalEl = document.getElementById("complex-data-modal");
  if (!modalEl) {
    return;
  }
  if (options.preset) {
    await applyComplexPreset(options.preset, options);
  }
  if (typeof options.startStep === "number") {
    state.complexWizard.currentStep = options.startStep;
  }
  if (!state.complexWizard.steps || !state.complexWizard.steps.length) {
    state.complexWizard.steps = ["intent", "fields", "relationships", "review"];
    state.complexWizard.stepLabels = [
      translate("complex.step_intent"),
      translate("complex.step_fields"),
      translate("complex.step_relationships"),
      translate("complex.step_review"),
    ];
  }
  state.complexWizard.modal = state.complexWizard.modal || new bootstrap.Modal(modalEl);
  renderComplexWizard();
  state.complexWizard.modal.show();
}

function bindComplexTabButtons() {
  const container = getComplexWizardContainer();
  if (!container) {
    return;
  }
  const launchButton = document.getElementById("complex-wizard-launch");
  const resumeButton = document.getElementById("complex-wizard-resume");
  const resetButton = document.getElementById("complex-wizard-reset");
  const insertLatest = document.getElementById("complex-wizard-insert-latest");
  const copyButton = document.getElementById("complex-wizard-copy");
  const backButton = document.getElementById("complex-wizard-back");
  const nextButton = document.getElementById("complex-wizard-next");
  const insertButton = document.getElementById("complex-wizard-insert");
  const runButton = document.getElementById("complex-wizard-run");
  const refreshButton = document.getElementById("complex-wizard-refresh");

  if (launchButton) {
    launchButton.textContent = getWizardDatasetValue("launchLabel", translate("complex.launch_button"));
    launchButton.addEventListener("click", () => {
      openComplexWizard();
    });
  }
  if (resumeButton) {
    resumeButton.textContent = getWizardDatasetValue("resumeLabel", translate("complex.resume_button"));
    resumeButton.addEventListener("click", () => {
      openComplexWizard();
    });
  }
  if (resetButton) {
    resetButton.textContent = getWizardDatasetValue("resetLabel", translate("complex.reset_button"));
    resetButton.addEventListener("click", () => {
      const confirmMessage = getWizardDatasetValue("resetConfirm", translate("complex.reset_confirm"));
      if (!confirmMessage || window.confirm(confirmMessage)) {
        resetComplexWizardState({ preserveLastQuery: false });
        renderComplexPresetLists();
        updateComplexWizardLatestQuery("", { silent: true });
      }
    });
  }
  if (insertLatest) {
    insertLatest.addEventListener("click", () => {
      const lastQuery = state.complexWizard.lastQuery;
      if (!lastQuery) {
        showToast(translate("complex.toast_no_query"), "warning");
        return;
      }
      const textarea = document.getElementById("soql-query");
      if (!textarea) {
        showToast(translate("complex.toast_no_editor"), "danger");
        return;
      }
      textarea.value = lastQuery;
      applyKeywordFormatting(textarea, { preserveCursor: false });
      refreshQueryEditorState();
      showToast(translate("complex.toast_inserted"));
    });
  }
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const query = buildComplexWizardQuery();
      if (!query) {
        showToast(translate("complex.toast_no_query"), "warning");
        return;
      }
      try {
        await navigator.clipboard.writeText(query);
        showToast(translate("complex.copy_success"));
      } catch (error) {
        showToast(translate("complex.copy_failure"), "danger");
      }
    });
  }
  if (backButton) {
    backButton.addEventListener("click", () => {
      if (state.complexWizard.currentStep > 0) {
        state.complexWizard.currentStep -= 1;
        renderComplexWizard();
      }
    });
  }
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const isLastStep = state.complexWizard.currentStep >= (state.complexWizard.steps?.length || 1) - 1;
      if (isLastStep) {
        if (state.complexWizard.modal) {
          state.complexWizard.modal.hide();
        }
      } else {
        state.complexWizard.currentStep += 1;
        renderComplexWizard();
      }
    });
  }
  if (insertButton) {
    insertButton.addEventListener("click", () => {
      insertComplexWizardQuery();
    });
  }
  if (runButton) {
    runButton.addEventListener("click", () => {
      runComplexWizardQuery();
    });
  }
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      const lastQuery = state.complexWizard.lastQuery;
      if (!lastQuery) {
        showToast(translate("complex.toast_no_query"), "warning");
        return;
      }
      insertComplexWizardQuery();
      runComplexWizardQuery();
    });
  }
}

function initializeComplexWizard() {
  const container = getComplexWizardContainer();
  if (!container || state.complexWizard.initialized) {
    return;
  }
  state.complexWizard.container = container;
  const templates = parseDatasetJSON(container, "templates", []);
  state.complexWizard.templates = Array.isArray(templates) ? templates : [];
  const tasks = parseDatasetJSON(container, "tasks", []);
  state.complexWizard.tasks = Array.isArray(tasks) ? tasks : [];
  const rawSteps = parseDatasetJSON(container, "stepLabels", []);
  if (Array.isArray(rawSteps) && rawSteps.length) {
    state.complexWizard.steps = rawSteps.map((item) => (typeof item === "object" ? item.id : item)).filter(Boolean);
    state.complexWizard.stepLabels = rawSteps.map((item, index) => {
      if (typeof item === "object" && item.label) {
        return item.label;
      }
      if (typeof item === "string") {
        return item;
      }
      return `${translate("complex.step_label")} ${index + 1}`;
    });
  } else {
    state.complexWizard.steps = ["intent", "fields", "relationships", "review"];
    state.complexWizard.stepLabels = [
      translate("complex.step_intent"),
      translate("complex.step_fields"),
      translate("complex.step_relationships"),
      translate("complex.step_review"),
    ];
  }
  bindComplexTabButtons();
  renderComplexPresetLists();
  updateComplexWizardLatestQuery(state.complexWizard.lastQuery || "", { silent: true });
  state.complexWizard.initialized = true;
}

function initializeAutocomplete() {
  const searchInput = document.getElementById("object-search");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      renderObjectList(event.target.value || "");
    });
    searchInput.disabled = !state.selectedOrg;
  }
  renderObjectList();
  renderFieldList([]);
}

function updateCustomEnvironmentVisibility(selectElement) {
  const input = document.getElementById("org-custom-environment");
  if (!input) return;
  if (selectElement.value === "custom") {
    input.classList.remove("d-none");
    input.required = true;
  } else {
    input.classList.add("d-none");
    input.required = false;
    input.value = "";
  }
}

function resetOrgForm(form) {
  form.reset();
  form.dataset.mode = "create";
  form.dataset.orgId = "";
  document.getElementById("org-form-submit").textContent = translate("form.save_button");
  const environmentSelect = document.getElementById("org-environment");
  environmentSelect.value = "production";
  document.getElementById("org-custom-environment").value = "";
  updateCustomEnvironmentVisibility(environmentSelect);
}

function bindOrgForm() {
  const form = document.getElementById("org-form");
  if (!form) return;
  form.dataset.mode = "create";
  const environmentSelect = document.getElementById("org-environment");
  const customEnvironmentInput = document.getElementById("org-custom-environment");
  environmentSelect.addEventListener("change", () => updateCustomEnvironmentVisibility(environmentSelect));
  document.getElementById("org-form-reset").addEventListener("click", () => resetOrgForm(form));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let environment = environmentSelect.value.trim();
    if (environment === "custom") {
      environment = customEnvironmentInput.value.trim();
    }
    const payload = {
      id: document.getElementById("org-id").value.trim(),
      label: document.getElementById("org-label").value.trim(),
      environment,
      client_id: document.getElementById("org-client-id").value.trim(),
      client_secret: document.getElementById("org-client-secret").value.trim(),
      redirect_uri: document.getElementById("org-redirect-uri").value.trim(),
      auth_scope: document.getElementById("org-scope").value.trim() || "full refresh_token",
    };

    if (!payload.id || !payload.label || !payload.client_id || !payload.redirect_uri || !payload.environment) {
      showToast(translate("toast.fill_required"), "warning");
      return;
    }

    if (form.dataset.mode === "create" && !payload.client_secret) {
      showToast(translate("toast.enter_secret"), "warning");
      return;
    }

    if (!payload.client_secret && form.dataset.mode !== "create") {
      delete payload.client_secret;
    }

    try {
      const response = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || translate("toast.save_failed"));
      }
      showToast(
        form.dataset.mode === "create"
          ? translate("toast.org_created")
          : translate("toast.org_updated")
      );
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : translate("toast.save_failed");
      showToast(message, "danger");
    }
  });

  document.querySelectorAll(".org-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const row = button.closest("tr");
      const environment = row.dataset.environment;
      form.dataset.mode = "edit";
      form.dataset.orgId = row.dataset.org;
      document.getElementById("org-id").value = row.children[0].textContent.trim();
      document.getElementById("org-label").value = row.children[1].textContent.trim();
      document.getElementById("org-client-id").value = row.dataset.clientId;
      document.getElementById("org-redirect-uri").value = row.dataset.redirectUri;
      document.getElementById("org-scope").value = row.dataset.scope;
      document.getElementById("org-client-secret").value = "";
      document.getElementById("org-form-submit").textContent = translate("form.update_button");
      if (environment === "production" || environment === "sandbox") {
        environmentSelect.value = environment;
        customEnvironmentInput.value = "";
      } else {
        environmentSelect.value = "custom";
        customEnvironmentInput.value = environment;
      }
      updateCustomEnvironmentVisibility(environmentSelect);
      document.getElementById("org-label").focus();
    });
  });

  document.querySelectorAll(".org-delete").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const row = button.closest("tr");
      const orgId = row.dataset.org;
      if (!confirm(translate("confirm.delete_org", { orgId }))) return;
      const response = await fetch(`/api/orgs/${orgId}`, { method: "DELETE" });
      if (response.ok) {
        showToast(translate("toast.org_deleted"), "info");
        row.remove();
        resetOrgForm(form);
      } else {
        showToast(translate("toast.delete_failed"), "danger");
      }
    });
  });

  updateCustomEnvironmentVisibility(environmentSelect);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeAppSettings();
  bindOrgSelection();
  restoreSelectedOrgSelection();
  bindQueryForm();
  bindQueryEditor();
  bindOrgForm();
  bindSnippetButtons();
  initializeSavedQueries();
  initializeQueryHistory();
  initializeAutocomplete();
  initializeComplexWizard();
  if (!state.selectedOrg) {
    loadMetadataForSelectedOrg();
  }
});
