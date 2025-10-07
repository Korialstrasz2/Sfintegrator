const state = {
  selectedOrg: null,
  savedQueries: [],
  activeSavedQueryId: null,
  metadata: {
    objects: [],
    fields: {},
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
};

const complexState = {
  rootElement: null,
  templates: [],
  config: null,
  stagedConfig: null,
  metadata: {
    describe: {},
  },
  wizard: {
    step: 1,
    totalSteps: 3,
  },
  previewQuery: "",
  lastResult: null,
  activeNodeId: null,
  relationshipTarget: null,
  relationshipSelection: null,
  relationshipOptions: [],
  fieldSelection: {
    nodeId: null,
    values: [],
  },
  wizardModalInstance: null,
  fieldModalInstance: null,
  relationshipModalInstance: null,
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
    } else if (!state.metadata.fields[objectName]) {
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

  const fields = state.metadata.fields[objectName] || [];
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
    updateComplexRunButtonState();
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
  updateComplexRunButtonState();
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
  state.metadata.fields = {};
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
  state.metadata.fields = {};
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
    if (!state.metadata.fields[objectName]) {
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
  if (state.metadata.fields[objectName]) {
    renderFieldList(state.metadata.fields[objectName]);
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
    state.metadata.fields[objectName] = Array.isArray(data) ? data : [];
    renderFieldList(state.metadata.fields[objectName]);
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
      ? state.metadata.fields[state.metadata.selectedObject] || []
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

let complexNodeCounter = 0;

function generateComplexNodeId() {
  complexNodeCounter += 1;
  return `node_${Date.now().toString(36)}_${complexNodeCounter}`;
}

function sanitizeComplexFieldList(fields) {
  const values = Array.isArray(fields) ? fields : [];
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    if (!value && value !== 0) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });
  return result;
}

function normalizeComplexNode(node) {
  if (!node) return null;
  const normalized = {
    id:
      typeof node.id === "string" && node.id.trim()
        ? node.id.trim()
        : generateComplexNodeId(),
    type: node.type === "parent" ? "parent" : "child",
    object_name:
      typeof node.object_name === "string" && node.object_name.trim()
        ? node.object_name.trim()
        : typeof node.object === "string" && node.object.trim()
        ? node.object.trim()
        : "",
    label:
      typeof node.label === "string" && node.label.trim()
        ? node.label.trim()
        : typeof node.object_label === "string" && node.object_label.trim()
        ? node.object_label.trim()
        : typeof node.object_name === "string" && node.object_name.trim()
        ? node.object_name.trim()
        : typeof node.object === "string" && node.object.trim()
        ? node.object.trim()
        : "",
    relationship_name:
      typeof node.relationship_name === "string" && node.relationship_name.trim()
        ? node.relationship_name.trim()
        : typeof node.relationshipName === "string" && node.relationshipName.trim()
        ? node.relationshipName.trim()
        : "",
    relationship_field:
      typeof node.relationship_field === "string" && node.relationship_field.trim()
        ? node.relationship_field.trim()
        : typeof node.relationshipField === "string" && node.relationshipField.trim()
        ? node.relationshipField.trim()
        : "",
    fields: sanitizeComplexFieldList(node.fields),
    filters: typeof node.filters === "string" ? node.filters.trim() : "",
    children: [],
  };
  const children = Array.isArray(node.children) ? node.children : [];
  normalized.children = children.map((child) => normalizeComplexNode(child)).filter(Boolean);
  return normalized;
}

function normalizeComplexConfig(config) {
  const source = config || {};
  const rootObject =
    typeof source.root_object === "string" && source.root_object.trim()
      ? source.root_object.trim()
      : typeof source.rootObject === "string" && source.rootObject.trim()
      ? source.rootObject.trim()
      : "Account";
  let rootFields = sanitizeComplexFieldList(source.root_fields || source.rootFields);
  if (!rootFields.length) {
    rootFields = ["Id", "Name"];
  } else if (!rootFields.some((field) => field.split(" ")[0] === "Id")) {
    rootFields.unshift("Id");
  }
  const relationships = Array.isArray(source.relationships)
    ? source.relationships.map((node) => normalizeComplexNode(node)).filter(Boolean)
    : [];
  return {
    root_object: rootObject,
    root_label:
      typeof source.root_label === "string" && source.root_label.trim()
        ? source.root_label.trim()
        : typeof source.rootLabel === "string" && source.rootLabel.trim()
        ? source.rootLabel.trim()
        : rootObject,
    root_fields: rootFields,
    filters: typeof source.filters === "string" ? source.filters.trim() : "",
    relationships,
  };
}

function cloneComplexConfig(config) {
  const raw = config ? JSON.parse(JSON.stringify(config)) : {};
  return normalizeComplexConfig(raw);
}

async function ensureComplexDescribe(objectName) {
  if (!objectName) {
    return null;
  }
  if (complexState.metadata.describe[objectName]) {
    return complexState.metadata.describe[objectName];
  }
  if (!state.selectedOrg) {
    throw new Error(translate("frontend.complex_account.select_org"));
  }
  const response = await fetch(
    `/api/sobjects/${encodeURIComponent(objectName)}/describe?org_id=${encodeURIComponent(state.selectedOrg)}`
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || translate("frontend.complex_account.describe_failed"));
  }
  complexState.metadata.describe[objectName] = data;
  return data;
}

function getComplexFields(objectName) {
  const describe = complexState.metadata.describe[objectName];
  if (!describe || !Array.isArray(describe.fields)) {
    return [];
  }
  return describe.fields;
}

function getComplexChildRelationships(objectName) {
  const describe = complexState.metadata.describe[objectName];
  if (!describe || !Array.isArray(describe.childRelationships)) {
    return [];
  }
  return describe.childRelationships;
}

function getComplexParentRelationships(objectName) {
  const describe = complexState.metadata.describe[objectName];
  if (!describe || !Array.isArray(describe.parentRelationships)) {
    return [];
  }
  return describe.parentRelationships;
}

function collectComplexParentFields(node) {
  const collected = [];
  sanitizeComplexFieldList(node.fields).forEach((field) => collected.push(field));
  node.children.forEach((child) => {
    if (child.type === "parent" && child.relationship_name) {
      const prefix = child.relationship_name;
      collectComplexParentFields(child).forEach((field) => {
        collected.push(`${prefix}.${field}`);
      });
    } else if (child.type === "child") {
      const subquery = buildComplexChildSubquery(child);
      if (subquery) {
        collected.push(subquery);
      }
    }
  });
  return collected;
}

function buildComplexChildSubquery(node) {
  if (!node || node.type !== "child" || !node.relationship_name) {
    return "";
  }
  const select = [];
  sanitizeComplexFieldList(node.fields).forEach((field) => select.push(field));
  node.children.forEach((child) => {
    if (child.type === "parent" && child.relationship_name) {
      const prefix = child.relationship_name;
      collectComplexParentFields(child).forEach((field) => {
        select.push(`${prefix}.${field}`);
      });
    } else if (child.type === "child") {
      const nested = buildComplexChildSubquery(child);
      if (nested) {
        select.push(nested);
      }
    }
  });
  if (!select.length) {
    select.push("Id");
  }
  const unique = Array.from(new Set(select));
  let query = `(SELECT ${unique.join(", ")} FROM ${node.relationship_name}`;
  if (node.filters) {
    query += ` WHERE ${node.filters}`;
  }
  query += ")";
  return query;
}

function buildComplexQuery(config) {
  if (!config) {
    return "";
  }
  const fields = [];
  sanitizeComplexFieldList(config.root_fields).forEach((field) => fields.push(field));
  config.relationships.forEach((node) => {
    if (node.type === "parent" && node.relationship_name) {
      const prefix = node.relationship_name;
      collectComplexParentFields(node).forEach((field) => {
        fields.push(`${prefix}.${field}`);
      });
    } else if (node.type === "child") {
      const subquery = buildComplexChildSubquery(node);
      if (subquery) {
        fields.push(subquery);
      }
    }
  });
  if (!fields.length) {
    fields.push("Id");
  }
  const uniqueFields = Array.from(new Set(fields));
  let soql = `SELECT ${uniqueFields.join(", ")} FROM ${config.root_object}`;
  if (config.filters) {
    soql += ` WHERE ${config.filters}`;
  }
  return soql;
}

function updateComplexWizardPreview() {
  if (!complexState.stagedConfig) {
    return;
  }
  try {
    complexState.previewQuery = buildComplexQuery(complexState.stagedConfig);
  } catch (error) {
    complexState.previewQuery = "";
  }
  const preview = document.getElementById("complex-wizard-preview");
  if (preview) {
    preview.textContent = complexState.previewQuery || "";
  }
}

function getComplexNodeById(nodeId, nodes = complexState.stagedConfig?.relationships) {
  if (!nodeId || !Array.isArray(nodes)) {
    return null;
  }
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const found = getComplexNodeById(nodeId, node.children);
    if (found) {
      return found;
    }
  }
  return null;
}

function getComplexParentOfNode(nodeId, nodes = complexState.stagedConfig?.relationships, parent = null) {
  if (!nodeId || !Array.isArray(nodes)) {
    return null;
  }
  for (const node of nodes) {
    if (node.id === nodeId) {
      return parent;
    }
    const found = getComplexParentOfNode(nodeId, node.children, node);
    if (found) {
      return found;
    }
  }
  return null;
}

function removeComplexNode(nodeId, nodes = complexState.stagedConfig?.relationships) {
  if (!nodeId || !Array.isArray(nodes)) {
    return false;
  }
  const index = nodes.findIndex((item) => item.id === nodeId);
  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }
  for (const node of nodes) {
    if (removeComplexNode(nodeId, node.children)) {
      return true;
    }
  }
  return false;
}

function renderComplexRootFields() {
  if (!complexState.stagedConfig) {
    return;
  }
  const fields = getComplexFields(complexState.stagedConfig.root_object);
  const searchInput = document.getElementById("complex-root-field-search");
  const listContainer = document.getElementById("complex-root-field-list");
  const selectedContainer = document.getElementById("complex-root-field-selected");
  if (!listContainer || !selectedContainer) {
    return;
  }
  const searchTerm = searchInput?.value?.trim().toLowerCase() || "";
  const selectedSet = new Set(complexState.stagedConfig.root_fields.map((field) => field.trim()));
  const filtered = fields.filter((field) => {
    if (!field?.name) return false;
    if (!searchTerm) return true;
    const label = field.label || "";
    return field.name.toLowerCase().includes(searchTerm) || label.toLowerCase().includes(searchTerm);
  });

  listContainer.innerHTML = filtered
    .map((field) => {
      const disabled = selectedSet.has(field.name.trim());
      return `
        <div class="wizard-field-item" data-field="${escapeHtml(field.name)}" data-disabled="${disabled}">
          <div>
            <strong>${escapeHtml(field.label || field.name)}</strong>
            <div class="text-muted small">${escapeHtml(field.name)}</div>
          </div>
          <button type="button" class="btn btn-sm ${disabled ? "btn-outline-secondary" : "btn-outline-primary"}">
            ${disabled ? translate("frontend.complex_account.field_added") : translate("frontend.complex_account.add_field")}
          </button>
        </div>
      `;
    })
    .join("");

  selectedContainer.innerHTML = complexState.stagedConfig.root_fields
    .map(
      (field) => `
        <span class="badge">
          ${escapeHtml(field)}
          <button type="button" data-field="${escapeHtml(field)}" aria-label="${translate(
            "frontend.complex_account.remove_field"
          )}">
            &times;
          </button>
        </span>
      `
    )
    .join("");
}

function renderComplexRelationshipTree() {
  const container = document.getElementById("complex-relationship-tree");
  if (!container || !complexState.stagedConfig) {
    return;
  }

  function renderNodes(nodes) {
    if (!nodes.length) {
      return `<p class="text-muted mb-0">${translate("frontend.complex_account.no_relationships")}</p>`;
    }
    return nodes
      .map((node) => {
        const childHtml = node.children.length ? `<div class="relationship-children">${renderNodes(node.children)}</div>` : "";
        const badges = [];
        badges.push(
          `<span class="badge text-uppercase">${node.type === "child" ? translate("frontend.complex_account.child") : translate("frontend.complex_account.parent")}</span>`
        );
        if (node.relationship_name) {
          badges.push(`<span class="badge">${escapeHtml(node.relationship_name)}</span>`);
        }
        const fieldSummary = node.fields.length
          ? node.fields.slice(0, 4).map((field) => escapeHtml(field)).join(", ") + (node.fields.length > 4 ? "…" : "")
          : translate("frontend.complex_account.no_fields_selected");
        const filterLine = node.filters
          ? `<div class="relationship-filter">${escapeHtml(node.filters)}</div>`
          : "";
        return `
          <div class="relationship-node" data-node-id="${escapeHtml(node.id)}">
            <div class="d-flex flex-column flex-lg-row justify-content-between gap-2">
              <div>
                <div class="d-flex flex-wrap gap-1 mb-1">${badges.join(" ")}</div>
                <strong>${escapeHtml(node.label || node.object_name || translate("frontend.complex_account.unnamed_relationship"))}</strong>
                <div class="text-muted small">${escapeHtml(node.object_name || "")}</div>
                <div class="text-muted small">${escapeHtml(fieldSummary)}</div>
                ${filterLine}
              </div>
              <div class="node-actions">
                <button type="button" class="btn btn-outline-primary btn-sm" data-action="fields" data-node-id="${escapeHtml(node.id)}">
                  ${translate("frontend.complex_account.configure_fields")}
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-action="filters" data-node-id="${escapeHtml(node.id)}">
                  ${translate("frontend.complex_account.configure_filters")}
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm" data-action="add-child" data-node-id="${escapeHtml(node.id)}">
                  ${translate("frontend.complex_account.add_child")}
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm" data-action="add-parent" data-node-id="${escapeHtml(node.id)}">
                  ${translate("frontend.complex_account.add_parent")}
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-action="remove" data-node-id="${escapeHtml(node.id)}">
                  ${translate("frontend.complex_account.remove_relationship")}
                </button>
              </div>
            </div>
            ${childHtml}
          </div>
        `;
      })
      .join("");
  }

  container.innerHTML = renderNodes(complexState.stagedConfig.relationships);
}

function renderComplexWizardSummary() {
  const container = document.getElementById("complex-wizard-summary");
  if (!container || !complexState.stagedConfig) {
    return;
  }
  const config = complexState.stagedConfig;
  const fieldsList = config.root_fields.map((field) => `<li>${escapeHtml(field)}</li>`).join("");
  function renderSummaryNodes(nodes) {
    if (!nodes.length) {
      return "";
    }
    return `
      <ul>
        ${nodes
          .map((node) => {
            const children = renderSummaryNodes(node.children);
            return `
              <li>
                <strong>${escapeHtml(node.label || node.object_name)}</strong>
                <div class="text-muted small">${escapeHtml(node.object_name)}</div>
                <div class="text-muted small">${escapeHtml(node.fields.join(", ") || translate("frontend.complex_account.no_fields_selected"))}</div>
                ${node.filters ? `<div class="text-muted small">${escapeHtml(node.filters)}</div>` : ""}
                ${children}
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }
  container.innerHTML = `
    <div class="summary-section">
      <h4 class="h6 mb-2">${translate("frontend.complex_account.summary.root")}</h4>
      <p class="mb-1"><strong>${escapeHtml(config.root_label || config.root_object)}</strong></p>
      <p class="text-muted small mb-2">${escapeHtml(config.root_object)}</p>
      <ul class="mb-2">${fieldsList}</ul>
      ${config.filters ? `<div class="text-muted small">${escapeHtml(config.filters)}</div>` : ""}
    </div>
    <div class="summary-section">
      <h4 class="h6 mb-2">${translate("frontend.complex_account.summary.relationships")}</h4>
      ${renderSummaryNodes(config.relationships) || `<p class="text-muted mb-0">${translate("frontend.complex_account.no_relationships")}</p>`}
    </div>
  `;
}

function renderComplexConfiguration() {
  const container = document.getElementById("complex-account-configuration");
  if (!container) {
    return;
  }
  if (!complexState.config) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <p class="mb-1">${translate("complex_account.configuration.empty")}</p>
        <p class="small mb-0">${translate("complex_account.configuration.empty_hint")}</p>
      </div>
    `;
    return;
  }
  const config = complexState.config;
  function renderNodes(nodes) {
    if (!nodes.length) {
      return "";
    }
    return `
      <ul class="configuration-tree">
        ${nodes
          .map((node) => {
            return `
              <li>
                <div class="fw-semibold">${escapeHtml(node.label || node.object_name)}</div>
                <div class="text-muted small">${escapeHtml(node.object_name)}</div>
                <div class="text-muted small">${escapeHtml(node.fields.join(", ") || translate("frontend.complex_account.no_fields_selected"))}</div>
                ${node.filters ? `<div class="text-muted small">${escapeHtml(node.filters)}</div>` : ""}
                ${renderNodes(node.children)}
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }
  container.innerHTML = `
    <div>
      <h3 class="h6">${escapeHtml(config.root_label || config.root_object)}</h3>
      <p class="text-muted small mb-2">${escapeHtml(config.root_object)}</p>
      <p class="small mb-2">${escapeHtml(config.root_fields.join(", "))}</p>
      ${config.filters ? `<p class="text-muted small mb-2">${escapeHtml(config.filters)}</p>` : ""}
      ${renderNodes(config.relationships)}
    </div>
  `;
}

function renderComplexTemplates() {
  const container = document.getElementById("complex-account-template-list");
  if (!container) {
    return;
  }
  if (!complexState.templates.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate("frontend.complex_account.no_templates")}</p>`;
    return;
  }
  container.innerHTML = complexState.templates
    .map(
      (template) => `
        <div class="complex-template-card" data-template-id="${escapeHtml(template.id)}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h3 class="h6 mb-1">${escapeHtml(template.name)}</h3>
              <p class="text-muted small mb-2">${escapeHtml(template.description || "")}</p>
            </div>
            <span class="badge bg-primary-subtle text-primary">${escapeHtml(
              complexState.rootElement?.dataset?.labelTemplateBadges || "Template"
            )}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-primary" data-action="use-template" data-template-id="${escapeHtml(
              template.id
            )}">
              ${translate("frontend.complex_account.use_template")}
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="preview-template" data-template-id="${escapeHtml(
              template.id
            )}">
              ${translate("frontend.complex_account.preview_template")}
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderComplexResults(result) {
  const container = document.getElementById("complex-account-results");
  if (!container) {
    return;
  }
  if (!result || !Array.isArray(result.records) || result.records.length === 0) {
    container.innerHTML = `<p class="text-muted mb-0">${translate("complex_account.run.no_records")}</p>`;
    return;
  }

  function renderValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (Array.isArray(value)) {
      return `<ul>${value.map((item) => `<li>${renderValue(item)}</li>`).join("")}</ul>`;
    }
    if (typeof value === "object") {
      if (Array.isArray(value.records)) {
        return renderRecords(value.records);
      }
      return `<pre class="mb-0">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    return escapeHtml(String(value));
  }

  function renderRecord(record) {
    const entries = Object.entries(record).filter(([key]) => key !== "attributes");
    if (!entries.length) {
      return "";
    }
    return `
      <ul class="result-tree">
        ${entries
          .map(([key, value]) => {
            return `
              <li>
                <details open>
                  <summary><span class="result-label">${escapeHtml(key)}</span></summary>
                  <div class="result-branch">${renderValue(value)}</div>
                </details>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function renderRecords(records) {
    return records
      .map((item, index) => {
        return `
          <details class="mb-2" open>
            <summary>
              <span class="result-pill">${index + 1}</span>
              ${escapeHtml(item.Name || item.Id || translate("frontend.complex_account.record"))}
            </summary>
            <div class="result-branch">${renderRecord(item)}</div>
          </details>
        `;
      })
      .join("");
  }

  container.innerHTML = renderRecords(result.records);
}

function setComplexResultsExpanded(expand) {
  document.querySelectorAll("#complex-account-results details").forEach((details) => {
    details.open = expand;
  });
}

async function openComplexFieldModal(nodeId) {
  const modalElement = document.getElementById("complexFieldModal");
  if (!modalElement) {
    return;
  }
  const node = getComplexNodeById(nodeId);
  if (!node) {
    return;
  }
  try {
    await ensureComplexDescribe(node.object_name);
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("frontend.complex_account.describe_failed");
    showToast(message, "danger");
    return;
  }
  complexState.fieldSelection = {
    nodeId,
    values: [...node.fields],
    object: node.object_name,
  };
  const title = document.getElementById("complex-field-modal-title");
  if (title) {
    title.textContent = translate("frontend.complex_account.field_modal_title", { object: node.label || node.object_name });
  }
  const search = document.getElementById("complex-field-search");
  if (search) {
    search.value = "";
  }
  renderComplexFieldModal();
  if (!complexState.fieldModalInstance) {
    complexState.fieldModalInstance = new bootstrap.Modal(modalElement);
  }
  complexState.fieldModalInstance.show();
}

function renderComplexFieldModal() {
  const listContainer = document.getElementById("complex-field-list");
  const selectedContainer = document.getElementById("complex-field-selected");
  if (!listContainer || !selectedContainer) {
    return;
  }
  const selection = complexState.fieldSelection || {};
  const fields = getComplexFields(selection.object) || [];
  const searchTerm = document.getElementById("complex-field-search")?.value?.trim().toLowerCase() || "";
  const selectedSet = new Set(selection.values || []);
  const filtered = fields.filter((field) => {
    if (!field?.name) return false;
    if (!searchTerm) return true;
    const label = field.label || "";
    return field.name.toLowerCase().includes(searchTerm) || label.toLowerCase().includes(searchTerm);
  });
  listContainer.innerHTML = filtered
    .map((field) => {
      const disabled = selectedSet.has(field.name.trim());
      return `
        <div class="wizard-field-item" data-field="${escapeHtml(field.name)}" data-disabled="${disabled}">
          <div>
            <strong>${escapeHtml(field.label || field.name)}</strong>
            <div class="text-muted small">${escapeHtml(field.name)}</div>
          </div>
          <button type="button" class="btn btn-sm ${disabled ? "btn-outline-secondary" : "btn-outline-primary"}">
            ${disabled ? translate("frontend.complex_account.field_added") : translate("frontend.complex_account.add_field")}
          </button>
        </div>
      `;
    })
    .join("");

  selectedContainer.innerHTML = (selection.values || [])
    .map(
      (field) => `
        <span class="badge">
          ${escapeHtml(field)}
          <button type="button" data-field="${escapeHtml(field)}" aria-label="${translate(
            "frontend.complex_account.remove_field"
          )}">
            &times;
          </button>
        </span>
      `
    )
    .join("");
}

function setComplexRelationshipSelection(option) {
  complexState.relationshipSelection = option;
  document.querySelectorAll("#complex-relationship-options .relationship-option").forEach((item) => {
    item.classList.toggle("active", item.dataset.optionId === option?.id);
  });
}

function renderComplexRelationshipOptions(searchTerm = "") {
  const container = document.getElementById("complex-relationship-options");
  if (!container) {
    return;
  }
  const normalized = searchTerm.trim().toLowerCase();
  const options = (complexState.relationshipOptions || []).filter((option) => {
    if (!normalized) {
      return true;
    }
    return (
      option.label.toLowerCase().includes(normalized) ||
      option.object.toLowerCase().includes(normalized) ||
      (option.relationshipName || "").toLowerCase().includes(normalized)
    );
  });
  if (!options.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate("frontend.complex_account.no_relationship_options")}</p>`;
    return;
  }
  container.innerHTML = options
    .map((option) => {
      return `
        <div class="relationship-option ${complexState.relationshipSelection?.id === option.id ? "active" : ""}" data-option-id="${escapeHtml(option.id)}">
          <div class="fw-semibold">${escapeHtml(option.label)}</div>
          <div class="text-muted small">${escapeHtml(option.object)}</div>
          ${option.relationshipName ? `<div class="text-muted small">${escapeHtml(option.relationshipName)}</div>` : ""}
        </div>
      `;
    })
    .join("");
}

async function openComplexRelationshipModal(targetNodeId, relationshipType) {
  const modalElement = document.getElementById("complexRelationshipModal");
  if (!modalElement || !complexState.stagedConfig) {
    return;
  }
  const targetId = targetNodeId || "root";
  const type = relationshipType || document.getElementById("complex-relationship-type")?.value || "child";
  const baseObject =
    targetId === "root"
      ? complexState.stagedConfig.root_object
      : getComplexNodeById(targetId)?.object_name || complexState.stagedConfig.root_object;
  try {
    await ensureComplexDescribe(baseObject);
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("frontend.complex_account.describe_failed");
    showToast(message, "danger");
    return;
  }
  complexState.relationshipTarget = targetId;
  const options = [];
  if (type === "child") {
    getComplexChildRelationships(baseObject).forEach((item) => {
      if (!item.relationshipName || !item.childSObject) {
        return;
      }
      const optionId = `${item.relationshipName}:${item.childSObject}`;
      options.push({
        id: optionId,
        type: "child",
        relationshipName: item.relationshipName,
        relationshipField: item.field || "",
        object: item.childSObject,
        label: `${item.childSObject} (${item.relationshipName})`,
      });
    });
  } else {
    getComplexParentRelationships(baseObject).forEach((item) => {
      if (!item.relationshipName || !Array.isArray(item.referenceTo) || !item.referenceTo.length) {
        return;
      }
      item.referenceTo.forEach((reference) => {
        const optionId = `${item.relationshipName}:${reference}`;
        options.push({
          id: optionId,
          type: "parent",
          relationshipName: item.relationshipName,
          relationshipField: item.field || "",
          object: reference,
          label: `${reference} (${item.relationshipName})`,
        });
      });
    });
  }
  complexState.relationshipOptions = options;
  complexState.relationshipSelection = null;
  const typeSelect = document.getElementById("complex-relationship-type");
  if (typeSelect) {
    typeSelect.value = type;
  }
  const search = document.getElementById("complex-relationship-search");
  if (search) {
    search.value = "";
  }
  renderComplexRelationshipOptions();
  if (!complexState.relationshipModalInstance) {
    complexState.relationshipModalInstance = new bootstrap.Modal(modalElement);
  }
  complexState.relationshipModalInstance.show();
}

function updateComplexWizardStep(step, options = {}) {
  if (!complexState.stagedConfig) {
    return;
  }
  if (options.reset) {
    complexState.wizard.step = 1;
  } else if (typeof step === "number") {
    complexState.wizard.step = Math.max(1, Math.min(complexState.wizard.totalSteps, step));
  }
  const currentStep = complexState.wizard.step;
  const steps = Array.from(document.querySelectorAll("#complex-wizard-content .wizard-step"));
  steps.forEach((element) => {
    const value = Number(element.dataset.step);
    element.classList.toggle("d-none", value !== currentStep);
  });

  const backButton = document.getElementById("complex-wizard-back");
  const nextButton = document.getElementById("complex-wizard-next");
  const finishButton = document.getElementById("complex-wizard-finish");
  if (backButton) {
    backButton.disabled = currentStep === 1;
  }
  if (nextButton && finishButton) {
    if (currentStep >= complexState.wizard.totalSteps) {
      nextButton.classList.add("d-none");
      finishButton.classList.remove("d-none");
    } else {
      nextButton.classList.remove("d-none");
      finishButton.classList.add("d-none");
    }
  }

  const labels = [
    translate("complex_account.wizard.steps.base.title"),
    translate("complex_account.wizard.steps.relationships.title"),
    translate("complex_account.wizard.steps.review.title"),
  ];
  const title = document.getElementById("complex-wizard-title");
  if (title) {
    title.textContent = `${translate("complex_account.wizard.step_label")} ${currentStep} ${translate(
      "complex_account.wizard.step_of"
    )} ${complexState.wizard.totalSteps} — ${labels[currentStep - 1]}`;
  }

  const stepContainer = document.getElementById("complex-wizard-steps");
  const progressBar = document.getElementById("complex-wizard-progress");
  if (stepContainer) {
    stepContainer.innerHTML = Array.from({ length: complexState.wizard.totalSteps }, (_, index) => {
      const stepNumber = index + 1;
      const status =
        stepNumber < currentStep ? "completed" : stepNumber === currentStep ? "active" : "";
      return `
        <div class="wizard-step-indicator ${status}">
          <div class="circle">${stepNumber}</div>
          <span>${escapeHtml(labels[index] || `Step ${stepNumber}`)}</span>
        </div>
      `;
    }).join("");
  }
  if (progressBar) {
    const percent = complexState.wizard.totalSteps > 1 ? ((currentStep - 1) / (complexState.wizard.totalSteps - 1)) * 100 : 0;
    progressBar.style.setProperty("background", `linear-gradient(90deg, #0d6efd ${percent}%, rgba(13,110,253,0.2) ${percent}%)`);
  }

  if (currentStep === 1) {
    renderComplexRootFields();
  } else if (currentStep === 2) {
    renderComplexRelationshipTree();
  } else if (currentStep === 3) {
    renderComplexWizardSummary();
  }

  updateComplexWizardPreview();
}

async function openComplexWizard(initialConfig = null) {
  if (!state.selectedOrg) {
    showToast(translate("frontend.complex_account.select_org"), "warning");
    return;
  }
  const modalElement = document.getElementById("complexWizardModal");
  if (!modalElement) {
    return;
  }
  complexState.stagedConfig = cloneComplexConfig(initialConfig || complexState.config || {});
  try {
    await ensureComplexDescribe(complexState.stagedConfig.root_object);
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("frontend.complex_account.describe_failed");
    showToast(message, "danger");
    return;
  }
  const filtersInput = document.getElementById("complex-root-filters");
  if (filtersInput) {
    filtersInput.value = complexState.stagedConfig.filters || "";
  }
  if (!complexState.wizardModalInstance) {
    complexState.wizardModalInstance = new bootstrap.Modal(modalElement, { backdrop: "static" });
  }
  updateComplexWizardStep(1, { reset: true });
  renderComplexRootFields();
  renderComplexRelationshipTree();
  renderComplexWizardSummary();
  updateComplexWizardPreview();
  complexState.wizardModalInstance.show();
}

function finalizeComplexWizard() {
  if (!complexState.stagedConfig) {
    return;
  }
  complexState.config = cloneComplexConfig(complexState.stagedConfig);
  complexState.previewQuery = buildComplexQuery(complexState.config);
  const queryLabel = document.getElementById("complex-account-last-query");
  if (queryLabel) {
    queryLabel.textContent = complexState.previewQuery || "";
  }
  renderComplexConfiguration();
  updateComplexRunButtonState();
  showToast(translate("frontend.complex_account.configuration_saved"));
  if (complexState.wizardModalInstance) {
    complexState.wizardModalInstance.hide();
  }
}

function updateComplexRunButtonState() {
  const runButton = document.getElementById("complex-account-run");
  if (!runButton) {
    return;
  }
  if (complexState.config && state.selectedOrg) {
    runButton.disabled = false;
    runButton.removeAttribute("title");
  } else {
    runButton.disabled = true;
    runButton.setAttribute("title", complexState.rootElement?.dataset?.labelRunDisabled || "");
  }
}

async function runComplexAccountPlan() {
  if (!complexState.config) {
    showToast(translate("frontend.complex_account.no_configuration"), "warning");
    return;
  }
  if (!state.selectedOrg) {
    showToast(translate("frontend.complex_account.select_org"), "warning");
    return;
  }
  const runButton = document.getElementById("complex-account-run");
  if (!runButton) {
    return;
  }
  const originalText = runButton.textContent;
  runButton.disabled = true;
  runButton.textContent = translate("frontend.complex_account.running");
  try {
    const response = await fetch("/api/complex-account/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: state.selectedOrg, config: complexState.config }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || translate("frontend.complex_account.run_failed"));
    }
    complexState.lastResult = data;
    renderComplexResults(data);
    const queryLabel = document.getElementById("complex-account-last-query");
    if (queryLabel) {
      queryLabel.textContent = data.query || "";
    }
    showToast(translate("frontend.complex_account.run_success"));
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("frontend.complex_account.run_failed");
    showToast(message, "danger");
  } finally {
    runButton.disabled = false;
    runButton.textContent = originalText;
  }
}

function initializeComplexAccountPage() {
  const root = document.getElementById("complex-account-root");
  if (!root) {
    return;
  }
  complexState.rootElement = root;
  try {
    const templates = JSON.parse(root.dataset.templates || "[]");
    complexState.templates = Array.isArray(templates)
      ? templates.map((item) => ({ ...item, config: cloneComplexConfig(item.config || {}) }))
      : [];
  } catch (error) {
    complexState.templates = [];
  }
  renderComplexTemplates();
  renderComplexConfiguration();
  updateComplexRunButtonState();

  const startButton = document.getElementById("complex-account-start");
  if (startButton) {
    startButton.addEventListener("click", () => openComplexWizard());
  }
  const loadTemplateButton = document.getElementById("complex-account-load-template");
  if (loadTemplateButton) {
    loadTemplateButton.addEventListener("click", () => {
      document.getElementById("complex-account-template-list")?.scrollIntoView({ behavior: "smooth" });
    });
  }
  const templateList = document.getElementById("complex-account-template-list");
  if (templateList) {
    templateList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const templateId = target.dataset.templateId;
      const template = complexState.templates.find((item) => item.id === templateId);
      if (!template) {
        return;
      }
      event.preventDefault();
      openComplexWizard(template.config);
    });
  }

  const runButton = document.getElementById("complex-account-run");
  if (runButton) {
    runButton.addEventListener("click", () => runComplexAccountPlan());
  }

  const expandButton = document.getElementById("complex-account-expand-all");
  if (expandButton) {
    expandButton.addEventListener("click", () => setComplexResultsExpanded(true));
  }
  const collapseButton = document.getElementById("complex-account-collapse-all");
  if (collapseButton) {
    collapseButton.addEventListener("click", () => setComplexResultsExpanded(false));
  }

  const rootFieldSearch = document.getElementById("complex-root-field-search");
  if (rootFieldSearch) {
    rootFieldSearch.addEventListener("input", () => renderComplexRootFields());
  }
  const filtersInput = document.getElementById("complex-root-filters");
  if (filtersInput) {
    filtersInput.addEventListener("input", (event) => {
      if (complexState.stagedConfig) {
        complexState.stagedConfig.filters = event.target.value.trim();
        updateComplexWizardPreview();
      }
    });
  }

  const rootFieldList = document.getElementById("complex-root-field-list");
  if (rootFieldList) {
    rootFieldList.addEventListener("click", (event) => {
      const item = event.target.closest(".wizard-field-item");
      if (!item || !complexState.stagedConfig) return;
      const field = item.dataset.field;
      if (!field || item.dataset.disabled === "true") {
        return;
      }
      complexState.stagedConfig.root_fields.push(field);
      complexState.stagedConfig.root_fields = sanitizeComplexFieldList(complexState.stagedConfig.root_fields);
      renderComplexRootFields();
      updateComplexWizardPreview();
    });
  }
  const rootFieldSelected = document.getElementById("complex-root-field-selected");
  if (rootFieldSelected) {
    rootFieldSelected.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-field]");
      if (!button || !complexState.stagedConfig) return;
      const field = button.dataset.field;
      complexState.stagedConfig.root_fields = complexState.stagedConfig.root_fields.filter((item) => item !== field);
      renderComplexRootFields();
      updateComplexWizardPreview();
    });
  }

  const relationshipToolbar = document.querySelector(".relationship-toolbar");
  if (relationshipToolbar) {
    relationshipToolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "add-child") {
        openComplexRelationshipModal("root", "child");
      } else if (action === "add-parent") {
        openComplexRelationshipModal("root", "parent");
      }
    });
  }

  const relationshipTree = document.getElementById("complex-relationship-tree");
  if (relationshipTree) {
    relationshipTree.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const nodeId = button.dataset.nodeId;
      const action = button.dataset.action;
      if (!nodeId || !complexState.stagedConfig) return;
      if (action === "fields") {
        openComplexFieldModal(nodeId);
      } else if (action === "filters") {
        const node = getComplexNodeById(nodeId);
        if (!node) return;
        const value = window.prompt(translate("frontend.complex_account.enter_filter"), node.filters || "");
        if (value !== null) {
          node.filters = value.trim();
          renderComplexRelationshipTree();
          updateComplexWizardPreview();
        }
      } else if (action === "add-child") {
        openComplexRelationshipModal(nodeId, "child");
      } else if (action === "add-parent") {
        openComplexRelationshipModal(nodeId, "parent");
      } else if (action === "remove") {
        removeComplexNode(nodeId);
        renderComplexRelationshipTree();
        updateComplexWizardPreview();
      }
    });
  }

  const relationshipTypeSelect = document.getElementById("complex-relationship-type");
  if (relationshipTypeSelect) {
    relationshipTypeSelect.addEventListener("change", () => {
      const target = complexState.relationshipTarget || "root";
      openComplexRelationshipModal(target, relationshipTypeSelect.value);
    });
  }

  const relationshipSearch = document.getElementById("complex-relationship-search");
  if (relationshipSearch) {
    relationshipSearch.addEventListener("input", () => renderComplexRelationshipOptions(relationshipSearch.value));
  }

  const relationshipOptions = document.getElementById("complex-relationship-options");
  if (relationshipOptions) {
    relationshipOptions.addEventListener("click", (event) => {
      const option = event.target.closest(".relationship-option");
      if (!option) return;
      const selected = (complexState.relationshipOptions || []).find((item) => item.id === option.dataset.optionId);
      if (selected) {
        setComplexRelationshipSelection(selected);
      }
    });
  }

  const relationshipApply = document.getElementById("complex-relationship-apply");
  if (relationshipApply) {
    relationshipApply.addEventListener("click", () => {
      if (!complexState.relationshipSelection || !complexState.stagedConfig) {
        showToast(translate("frontend.complex_account.select_relationship_option"), "warning");
        return;
      }
      const targetId = complexState.relationshipTarget || "root";
      const selection = complexState.relationshipSelection;
      const node = normalizeComplexNode({
        id: generateComplexNodeId(),
        type: selection.type,
        object_name: selection.object,
        label: selection.label,
        relationship_name: selection.relationshipName,
        relationship_field: selection.relationshipField,
        fields: ["Id", "Name"],
        filters: "",
        children: [],
      });
      if (selection.type === "child" && selection.relationshipField) {
        if (!node.fields.includes(selection.relationshipField)) {
          node.fields.push(selection.relationshipField);
        }
      }
      if (targetId === "root") {
        complexState.stagedConfig.relationships.push(node);
      } else {
        const parentNode = getComplexNodeById(targetId);
        if (parentNode) {
          parentNode.children.push(node);
        }
      }
      if (complexState.relationshipModalInstance) {
        complexState.relationshipModalInstance.hide();
      }
      renderComplexRelationshipTree();
      updateComplexWizardPreview();
    });
  }

  const fieldListModal = document.getElementById("complex-field-list");
  if (fieldListModal) {
    fieldListModal.addEventListener("click", (event) => {
      const item = event.target.closest(".wizard-field-item");
      if (!item || !complexState.fieldSelection) return;
      if (item.dataset.disabled === "true") {
        return;
      }
      const field = item.dataset.field;
      complexState.fieldSelection.values.push(field);
      complexState.fieldSelection.values = sanitizeComplexFieldList(complexState.fieldSelection.values);
      renderComplexFieldModal();
    });
  }

  const fieldSelectedModal = document.getElementById("complex-field-selected");
  if (fieldSelectedModal) {
    fieldSelectedModal.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-field]");
      if (!button || !complexState.fieldSelection) return;
      const field = button.dataset.field;
      complexState.fieldSelection.values = complexState.fieldSelection.values.filter((item) => item !== field);
      renderComplexFieldModal();
    });
  }

  const fieldSearchModal = document.getElementById("complex-field-search");
  if (fieldSearchModal) {
    fieldSearchModal.addEventListener("input", () => renderComplexFieldModal());
  }

  const fieldApplyButton = document.getElementById("complex-field-apply");
  if (fieldApplyButton) {
    fieldApplyButton.addEventListener("click", () => {
      const selection = complexState.fieldSelection;
      if (!selection) {
        return;
      }
      const node = getComplexNodeById(selection.nodeId);
      if (!node) {
        return;
      }
      node.fields = sanitizeComplexFieldList(selection.values);
      renderComplexRelationshipTree();
      updateComplexWizardPreview();
      if (complexState.fieldModalInstance) {
        complexState.fieldModalInstance.hide();
      }
    });
  }

  const wizardBack = document.getElementById("complex-wizard-back");
  if (wizardBack) {
    wizardBack.addEventListener("click", () => {
      updateComplexWizardStep(complexState.wizard.step - 1);
    });
  }
  const wizardNext = document.getElementById("complex-wizard-next");
  if (wizardNext) {
    wizardNext.addEventListener("click", () => {
      updateComplexWizardStep(complexState.wizard.step + 1);
    });
  }
  const wizardFinish = document.getElementById("complex-wizard-finish");
  if (wizardFinish) {
    wizardFinish.addEventListener("click", () => finalizeComplexWizard());
  }

  const wizardModalElement = document.getElementById("complexWizardModal");
  if (wizardModalElement) {
    wizardModalElement.addEventListener("hidden.bs.modal", () => {
      complexState.fieldSelection = { nodeId: null, values: [] };
      complexState.relationshipSelection = null;
      complexState.relationshipTarget = null;
    });
  }
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
  initializeComplexAccountPage();
  if (!state.selectedOrg) {
    loadMetadataForSelectedOrg();
  }
  updateComplexRunButtonState();
});
