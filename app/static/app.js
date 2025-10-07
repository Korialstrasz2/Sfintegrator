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
  queryBuilder: {
    step: 0,
    template: "blank",
    baseObject: "",
    selectedFields: [],
    fieldFilter: "",
    useCount: false,
    filters: [],
    sorts: [],
    limit: "",
    childQueries: [],
    counters: {
      filter: 0,
      sort: 0,
      child: 0,
    },
  },
};

const STORAGE_PREFIX = "sfint";
const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}.settings`,
  savedQueries: `${STORAGE_PREFIX}.savedQueries`,
  selectedOrg: `${STORAGE_PREFIX}.selectedOrg`,
  queryDraft: `${STORAGE_PREFIX}.queryDraft`,
};

const QUERY_COMPOSER_STEPS = ["templates", "fields", "filters", "review"];
const QUERY_COMPOSER_OPERATOR_OPTIONS = [
  { value: "=", key: "equals" },
  { value: "!=", key: "not_equals" },
  { value: ">", key: "greater" },
  { value: ">=", key: "greater_or_equal" },
  { value: "<", key: "less" },
  { value: "<=", key: "less_or_equal" },
  { value: "LIKE", key: "like" },
  { value: "NOT LIKE", key: "not_like" },
  { value: "IN", key: "in" },
  { value: "NOT IN", key: "not_in" },
  { value: "INCLUDES", key: "includes" },
  { value: "EXCLUDES", key: "excludes" },
];
const QUERY_COMPOSER_LOGIC_OPTIONS = [
  { value: "AND", key: "and" },
  { value: "OR", key: "or" },
];
const QUERY_COMPOSER_DIRECTION_OPTIONS = [
  { value: "ASC", key: "asc" },
  { value: "DESC", key: "desc" },
];

let queryComposerModal = null;

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
    updateQueryComposerAvailability();
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
  updateQueryComposerAvailability();
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
    updateComposerObjectOptions([]);
    showElement(empty, true);
    return;
  }

  const objects = state.metadata.objects.filter((item) => {
    if (!normalizedFilter) return true;
    const nameMatch = item.name?.toLowerCase().includes(normalizedFilter);
    const labelMatch = item.label?.toLowerCase().includes(normalizedFilter);
    return nameMatch || labelMatch;
  });

  updateComposerObjectOptions(objects.map((item) => item.name));

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
    updateComposerFieldOptions([]);
    showElement(empty, true);
    return;
  }
  showElement(empty, false);

  updateComposerFieldOptions(values);

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
  renderQueryComposerAvailableFields();
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

function updateComposerObjectOptions(names = []) {
  const datalist = document.getElementById("query-composer-object-options");
  if (!datalist) return;
  datalist.innerHTML = "";
  names
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim())
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      datalist.appendChild(option);
    });
}

function updateComposerFieldOptions(fields = []) {
  const datalist = document.getElementById("query-composer-field-options");
  if (!datalist) return;
  datalist.innerHTML = "";
  const names = fields
    .map((item) => (typeof item === "string" ? item : item?.name))
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());
  names
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      datalist.appendChild(option);
    });
}

function resetQueryComposerState() {
  const builder = state.queryBuilder;
  builder.step = 0;
  builder.template = "blank";
  builder.baseObject = builder.baseObject || state.metadata.selectedObject || "";
  builder.selectedFields = [];
  builder.fieldFilter = "";
  builder.useCount = false;
  builder.filters = [];
  builder.sorts = [];
  builder.limit = "";
  builder.childQueries = [];
  builder.counters = { filter: 0, sort: 0, child: 0 };
}

function createComposerFilter(overrides = {}) {
  const builder = state.queryBuilder;
  builder.counters.filter += 1;
  return {
    id: `filter-${builder.counters.filter}`,
    field: "",
    operator: "=",
    value: "",
    logic: "AND",
    ...overrides,
  };
}

function createComposerSort(overrides = {}) {
  const builder = state.queryBuilder;
  builder.counters.sort += 1;
  return {
    id: `sort-${builder.counters.sort}`,
    field: "",
    direction: "ASC",
    ...overrides,
  };
}

function createComposerChild(overrides = {}) {
  const builder = state.queryBuilder;
  builder.counters.child += 1;
  return {
    id: `child-${builder.counters.child}`,
    relationship: "",
    fields: "",
    where: "",
    order: "",
    limit: "",
    ...overrides,
  };
}

const QUERY_COMPOSER_TEMPLATES = [
  {
    id: "blank",
    labelKey: "composer.templates.blank.label",
    descriptionKey: "composer.templates.blank.description",
    apply(builder) {
      builder.selectedFields = ["Id", "Name"];
    },
  },
  {
    id: "recent",
    labelKey: "composer.templates.recent.label",
    descriptionKey: "composer.templates.recent.description",
    apply(builder) {
      builder.selectedFields = ["Id", "Name"];
      builder.sorts = [createComposerSort({ field: "CreatedDate", direction: "DESC" })];
      builder.limit = "50";
    },
  },
  {
    id: "my_records",
    labelKey: "composer.templates.my_records.label",
    descriptionKey: "composer.templates.my_records.description",
    apply(builder) {
      builder.selectedFields = ["Id", "Name"];
      builder.filters = [createComposerFilter({ field: "OwnerId", operator: "=", value: ":User.Id" })];
    },
  },
  {
    id: "with_children",
    labelKey: "composer.templates.with_children.label",
    descriptionKey: "composer.templates.with_children.description",
    apply(builder) {
      builder.selectedFields = ["Id", "Name"];
      builder.childQueries = [
        createComposerChild({
          relationship: "Contacts",
          fields: "Id, Name, Email",
          limit: "100",
        }),
      ];
    },
  },
];

function getQueryComposerTemplate(templateId) {
  return QUERY_COMPOSER_TEMPLATES.find((template) => template.id === templateId) || QUERY_COMPOSER_TEMPLATES[0];
}

function renderQueryComposerTemplates() {
  const container = document.getElementById("query-composer-templates");
  if (!container) return;
  container.innerHTML = "";
  const currentId = state.queryBuilder.template;
  QUERY_COMPOSER_TEMPLATES.forEach((template) => {
    const col = document.createElement("div");
    col.className = "col";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-outline-secondary w-100 text-start h-100 query-composer-template";
    if (template.id === currentId) {
      button.classList.add("active");
    }
    const title = document.createElement("span");
    title.className = "fw-semibold d-block";
    title.textContent = translate(template.labelKey);
    button.appendChild(title);
    const description = document.createElement("span");
    description.className = "small text-muted";
    description.textContent = translate(template.descriptionKey);
    button.appendChild(description);
    button.addEventListener("click", () => {
      setQueryComposerTemplate(template.id);
    });
    col.appendChild(button);
    container.appendChild(col);
  });
}

function setQueryComposerTemplate(templateId, options = {}) {
  const builder = state.queryBuilder;
  const template = getQueryComposerTemplate(templateId);
  builder.template = template.id;
  builder.selectedFields = [];
  builder.filters = [];
  builder.sorts = [];
  builder.childQueries = [];
  builder.limit = "";
  builder.useCount = false;
  builder.counters.filter = 0;
  builder.counters.sort = 0;
  builder.counters.child = 0;
  template.apply(builder);
  if (!options.silent) {
    renderQueryComposerTemplates();
    renderQueryComposerSelectedFields();
    renderQueryComposerAvailableFields();
    renderQueryComposerFilters();
    renderQueryComposerSorts();
    renderQueryComposerChildren();
    renderQueryComposerReview();
    updateQueryComposerPreview();
    updateQueryComposerNavigation();
  }
}

async function setQueryComposerBaseObject(objectName) {
  const normalized = typeof objectName === "string" ? objectName.trim() : "";
  state.queryBuilder.baseObject = normalized;
  const input = document.getElementById("query-composer-base-object");
  if (input && input.value !== normalized) {
    input.value = normalized;
  }
  if (!normalized) {
    renderQueryComposerAvailableFields();
    updateQueryComposerPreview();
    return;
  }
  if (state.metadata.selectedObject !== normalized) {
    selectObject(normalized, { silent: true });
  }
  await loadFieldsForObject(normalized);
  renderQueryComposerAvailableFields();
  renderQueryComposerSelectedFields();
  updateQueryComposerPreview();
}

function renderQueryComposerAvailableFields() {
  const container = document.getElementById("query-composer-available-fields");
  const empty = document.getElementById("query-composer-available-fields-empty");
  if (!container || !empty) return;
  const builder = state.queryBuilder;
  const objectName = builder.baseObject;
  const fields = objectName ? state.metadata.fields[objectName] || [] : [];
  const filterText = (builder.fieldFilter || "").toLowerCase();
  container.innerHTML = "";
  if (!fields.length) {
    empty.textContent = translate("composer.fields.available_empty");
    showElement(empty, true);
    return;
  }
  const filtered = fields.filter((field) => {
    if (!filterText) return true;
    const target = `${field.name} ${field.label || ""}`.toLowerCase();
    return target.includes(filterText);
  });
  if (!filtered.length) {
    empty.textContent = translate("composer.fields.filter_empty");
    showElement(empty, true);
    return;
  }
  showElement(empty, false);
  const selectedSet = new Set(
    builder.selectedFields.map((field) => normalizeFieldName(field))
  );
  filtered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach((field) => {
      const item = document.createElement("div");
      item.className = "query-composer-field-item";
      if (selectedSet.has(normalizeFieldName(field.name))) {
        item.classList.add("active");
      }
      const textContainer = document.createElement("div");
      textContainer.className = "d-flex flex-column";
      const nameEl = document.createElement("span");
      nameEl.className = "fw-semibold";
      nameEl.textContent = field.name;
      textContainer.appendChild(nameEl);
      if (field.label && field.label !== field.name) {
        const labelEl = document.createElement("span");
        labelEl.className = "small text-muted";
        labelEl.textContent = field.label;
        textContainer.appendChild(labelEl);
      }
      item.appendChild(textContainer);
      if (field.type) {
        const badge = document.createElement("span");
        badge.className = "badge bg-light text-dark";
        badge.textContent = field.type;
        item.appendChild(badge);
      }
      item.addEventListener("click", () => addFieldToComposer(field.name));
      container.appendChild(item);
    });
}

function renderQueryComposerSelectedFields() {
  const container = document.getElementById("query-composer-selected-fields");
  const empty = document.getElementById("query-composer-selected-fields-empty");
  if (!container || !empty) return;
  const toggle = document.getElementById("query-composer-use-count");
  if (toggle) {
    toggle.checked = state.queryBuilder.useCount;
  }
  container.innerHTML = "";
  const fields = state.queryBuilder.selectedFields;
  if (!fields.length) {
    empty.textContent = translate("composer.fields.selected_empty");
    showElement(empty, true);
    return;
  }
  showElement(empty, false);
  fields.forEach((field, index) => {
    const chip = document.createElement("span");
    chip.className = "query-composer-chip";
    chip.textContent = field;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", translate("composer.filters.remove"));
    removeButton.innerHTML = "&times;";
    removeButton.addEventListener("click", () => removeFieldFromComposer(index));
    chip.appendChild(removeButton);
    container.appendChild(chip);
  });
}

function addFieldToComposer(field) {
  const value = typeof field === "string" ? field.trim() : "";
  if (!value) return;
  const normalized = normalizeFieldName(value);
  const exists = state.queryBuilder.selectedFields.some(
    (item) => normalizeFieldName(item) === normalized
  );
  if (exists) {
    showToast(translate("composer.messages.field_exists", { field: value }), "info");
    return;
  }
  state.queryBuilder.selectedFields.push(value);
  renderQueryComposerSelectedFields();
  renderQueryComposerAvailableFields();
  updateQueryComposerPreview();
  renderQueryComposerReview();
  updateQueryComposerNavigation();
}

function removeFieldFromComposer(index) {
  if (index < 0 || index >= state.queryBuilder.selectedFields.length) {
    return;
  }
  state.queryBuilder.selectedFields.splice(index, 1);
  renderQueryComposerSelectedFields();
  renderQueryComposerAvailableFields();
  updateQueryComposerPreview();
  renderQueryComposerReview();
  updateQueryComposerNavigation();
}

function addComposerFilter(overrides = {}) {
  state.queryBuilder.filters.push(createComposerFilter(overrides));
  renderQueryComposerFilters();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function removeComposerFilter(id) {
  state.queryBuilder.filters = state.queryBuilder.filters.filter((filter) => filter.id !== id);
  renderQueryComposerFilters();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function renderQueryComposerFilters() {
  const container = document.getElementById("query-composer-filters");
  if (!container) return;
  container.innerHTML = "";
  if (!state.queryBuilder.filters.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("composer.review.empty");
    container.appendChild(empty);
    return;
  }
  state.queryBuilder.filters.forEach((filter, index) => {
    const card = document.createElement("div");
    card.className = "composer-card";
    card.dataset.id = filter.id;

    const row = document.createElement("div");
    row.className = "row g-2 align-items-end";

    const logicCol = document.createElement("div");
    logicCol.className = "col-12 col-md-3 col-lg-2";
    const logicLabel = document.createElement("label");
    logicLabel.className = "form-label small";
    logicLabel.textContent = translate("composer.filters.logic_label");
    logicCol.appendChild(logicLabel);
    const logicSelect = document.createElement("select");
    logicSelect.className = "form-select form-select-sm";
    logicSelect.disabled = index === 0;
    QUERY_COMPOSER_LOGIC_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = translate(`composer.filters.logic.${option.key}`);
      logicSelect.appendChild(opt);
    });
    logicSelect.value = filter.logic || "AND";
    logicSelect.addEventListener("change", (event) => {
      filter.logic = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    logicCol.appendChild(logicSelect);
    row.appendChild(logicCol);

    const fieldCol = document.createElement("div");
    fieldCol.className = "col-12 col-md-4 col-lg-3";
    const fieldLabel = document.createElement("label");
    fieldLabel.className = "form-label small";
    fieldLabel.textContent = translate("composer.filters.field_placeholder");
    fieldCol.appendChild(fieldLabel);
    const fieldInput = document.createElement("input");
    fieldInput.className = "form-control form-control-sm";
    fieldInput.type = "text";
    fieldInput.placeholder = translate("composer.filters.field_placeholder");
    fieldInput.list = "query-composer-field-options";
    fieldInput.value = filter.field || "";
    fieldInput.addEventListener("input", (event) => {
      filter.field = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    fieldCol.appendChild(fieldInput);
    row.appendChild(fieldCol);

    const operatorCol = document.createElement("div");
    operatorCol.className = "col-6 col-md-3 col-lg-2";
    const operatorLabel = document.createElement("label");
    operatorLabel.className = "form-label small";
    operatorLabel.textContent = translate("composer.filters.operator_label");
    operatorCol.appendChild(operatorLabel);
    const operatorSelect = document.createElement("select");
    operatorSelect.className = "form-select form-select-sm";
    QUERY_COMPOSER_OPERATOR_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = translate(`composer.filters.operators.${option.key}`);
      operatorSelect.appendChild(opt);
    });
    operatorSelect.value = filter.operator || "=";
    operatorSelect.addEventListener("change", (event) => {
      filter.operator = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    operatorCol.appendChild(operatorSelect);
    row.appendChild(operatorCol);

    const valueCol = document.createElement("div");
    valueCol.className = "col-6 col-md-3 col-lg-3";
    const valueLabel = document.createElement("label");
    valueLabel.className = "form-label small";
    valueLabel.textContent = translate("composer.filters.value_placeholder");
    valueCol.appendChild(valueLabel);
    const valueInput = document.createElement("input");
    valueInput.className = "form-control form-control-sm";
    valueInput.type = "text";
    valueInput.placeholder = translate("composer.filters.value_placeholder");
    valueInput.value = filter.value || "";
    valueInput.addEventListener("input", (event) => {
      filter.value = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    valueCol.appendChild(valueInput);
    row.appendChild(valueCol);

    const removeCol = document.createElement("div");
    removeCol.className = "col-12 col-lg-2 text-lg-end";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-link text-danger p-0 small";
    removeBtn.textContent = translate("composer.filters.remove");
    removeBtn.addEventListener("click", () => removeComposerFilter(filter.id));
    removeCol.appendChild(removeBtn);
    row.appendChild(removeCol);

    card.appendChild(row);
    container.appendChild(card);
  });
}

function addComposerSort(overrides = {}) {
  state.queryBuilder.sorts.push(createComposerSort(overrides));
  renderQueryComposerSorts();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function removeComposerSort(id) {
  state.queryBuilder.sorts = state.queryBuilder.sorts.filter((sort) => sort.id !== id);
  renderQueryComposerSorts();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function renderQueryComposerSorts() {
  const container = document.getElementById("query-composer-sorts");
  if (!container) return;
  container.innerHTML = "";
  if (!state.queryBuilder.sorts.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("composer.review.empty");
    container.appendChild(empty);
    return;
  }
  state.queryBuilder.sorts.forEach((sort) => {
    const card = document.createElement("div");
    card.className = "composer-card";
    card.dataset.id = sort.id;

    const row = document.createElement("div");
    row.className = "row g-2 align-items-end";

    const fieldCol = document.createElement("div");
    fieldCol.className = "col-12 col-md-6";
    const fieldLabel = document.createElement("label");
    fieldLabel.className = "form-label small";
    fieldLabel.textContent = translate("composer.sorting.field_placeholder");
    fieldCol.appendChild(fieldLabel);
    const fieldInput = document.createElement("input");
    fieldInput.className = "form-control form-control-sm";
    fieldInput.type = "text";
    fieldInput.placeholder = translate("composer.sorting.field_placeholder");
    fieldInput.list = "query-composer-field-options";
    fieldInput.value = sort.field || "";
    fieldInput.addEventListener("input", (event) => {
      sort.field = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    fieldCol.appendChild(fieldInput);
    row.appendChild(fieldCol);

    const directionCol = document.createElement("div");
    directionCol.className = "col-6 col-md-3";
    const directionLabel = document.createElement("label");
    directionLabel.className = "form-label small";
    directionLabel.textContent = translate("composer.sorting.direction_label");
    directionCol.appendChild(directionLabel);
    const directionSelect = document.createElement("select");
    directionSelect.className = "form-select form-select-sm";
    QUERY_COMPOSER_DIRECTION_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = translate(`composer.sorting.directions.${option.key}`);
      directionSelect.appendChild(opt);
    });
    directionSelect.value = sort.direction || "ASC";
    directionSelect.addEventListener("change", (event) => {
      sort.direction = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    directionCol.appendChild(directionSelect);
    row.appendChild(directionCol);

    const removeCol = document.createElement("div");
    removeCol.className = "col-6 col-md-3 text-md-end";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-link text-danger p-0 small";
    removeBtn.textContent = translate("composer.sorting.remove");
    removeBtn.addEventListener("click", () => removeComposerSort(sort.id));
    removeCol.appendChild(removeBtn);
    row.appendChild(removeCol);

    card.appendChild(row);
    container.appendChild(card);
  });
}

function addComposerChild(overrides = {}) {
  state.queryBuilder.childQueries.push(createComposerChild(overrides));
  renderQueryComposerChildren();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function removeComposerChild(id) {
  state.queryBuilder.childQueries = state.queryBuilder.childQueries.filter((child) => child.id !== id);
  renderQueryComposerChildren();
  renderQueryComposerReview();
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
}

function renderQueryComposerChildren() {
  const container = document.getElementById("query-composer-children");
  if (!container) return;
  container.innerHTML = "";
  if (!state.queryBuilder.childQueries.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("composer.review.empty");
    container.appendChild(empty);
    return;
  }
  state.queryBuilder.childQueries.forEach((child) => {
    const card = document.createElement("div");
    card.className = "composer-card";
    card.dataset.id = child.id;

    const row = document.createElement("div");
    row.className = "row g-2";

    const relationshipCol = document.createElement("div");
    relationshipCol.className = "col-12 col-md-4";
    const relationshipLabel = document.createElement("label");
    relationshipLabel.className = "form-label small";
    relationshipLabel.textContent = translate("composer.child_queries.relationship_label");
    relationshipCol.appendChild(relationshipLabel);
    const relationshipInput = document.createElement("input");
    relationshipInput.className = "form-control form-control-sm";
    relationshipInput.type = "text";
    relationshipInput.placeholder = translate("composer.child_queries.relationship_placeholder");
    relationshipInput.value = child.relationship || "";
    relationshipInput.addEventListener("input", (event) => {
      child.relationship = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    relationshipCol.appendChild(relationshipInput);
    row.appendChild(relationshipCol);

    const fieldsCol = document.createElement("div");
    fieldsCol.className = "col-12 col-md-8";
    const fieldsLabel = document.createElement("label");
    fieldsLabel.className = "form-label small";
    fieldsLabel.textContent = translate("composer.child_queries.fields_label");
    fieldsCol.appendChild(fieldsLabel);
    const fieldsInput = document.createElement("input");
    fieldsInput.className = "form-control form-control-sm";
    fieldsInput.type = "text";
    fieldsInput.placeholder = translate("composer.child_queries.fields_placeholder");
    fieldsInput.list = "query-composer-field-options";
    fieldsInput.value = child.fields || "";
    fieldsInput.addEventListener("input", (event) => {
      child.fields = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    fieldsCol.appendChild(fieldsInput);
    row.appendChild(fieldsCol);

    const whereCol = document.createElement("div");
    whereCol.className = "col-12 col-md-6";
    const whereLabel = document.createElement("label");
    whereLabel.className = "form-label small";
    whereLabel.textContent = translate("composer.child_queries.where_label");
    whereCol.appendChild(whereLabel);
    const whereInput = document.createElement("input");
    whereInput.className = "form-control form-control-sm";
    whereInput.type = "text";
    whereInput.placeholder = translate("composer.child_queries.where_placeholder");
    whereInput.value = child.where || "";
    whereInput.addEventListener("input", (event) => {
      child.where = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    whereCol.appendChild(whereInput);
    row.appendChild(whereCol);

    const orderCol = document.createElement("div");
    orderCol.className = "col-12 col-md-4";
    const orderLabel = document.createElement("label");
    orderLabel.className = "form-label small";
    orderLabel.textContent = translate("composer.child_queries.order_label");
    orderCol.appendChild(orderLabel);
    const orderInput = document.createElement("input");
    orderInput.className = "form-control form-control-sm";
    orderInput.type = "text";
    orderInput.placeholder = translate("composer.child_queries.order_placeholder");
    orderInput.value = child.order || "";
    orderInput.addEventListener("input", (event) => {
      child.order = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    orderCol.appendChild(orderInput);
    row.appendChild(orderCol);

    const limitCol = document.createElement("div");
    limitCol.className = "col-12 col-md-2";
    const limitLabel = document.createElement("label");
    limitLabel.className = "form-label small";
    limitLabel.textContent = translate("composer.child_queries.limit_label");
    limitCol.appendChild(limitLabel);
    const limitInput = document.createElement("input");
    limitInput.className = "form-control form-control-sm";
    limitInput.type = "number";
    limitInput.min = "1";
    limitInput.placeholder = translate("composer.child_queries.limit_placeholder");
    limitInput.value = child.limit || "";
    limitInput.addEventListener("input", (event) => {
      child.limit = event.target.value;
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
    limitCol.appendChild(limitInput);
    row.appendChild(limitCol);

    const removeCol = document.createElement("div");
    removeCol.className = "col-12 text-end";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-link text-danger p-0 small";
    removeBtn.textContent = translate("composer.child_queries.remove");
    removeBtn.addEventListener("click", () => removeComposerChild(child.id));
    removeCol.appendChild(removeBtn);
    row.appendChild(removeCol);

    card.appendChild(row);
    container.appendChild(card);
  });
}

function renderQueryComposerReview() {
  const container = document.getElementById("query-composer-review");
  if (!container) return;
  container.innerHTML = "";
  const builder = state.queryBuilder;
  const reviewItems = [
    {
      label: translate("composer.review.object"),
      values: builder.baseObject ? [builder.baseObject] : [],
    },
    {
      label: translate("composer.review.fields"),
      values: builder.useCount ? ["COUNT()"] : builder.selectedFields.slice(),
    },
    {
      label: translate("composer.review.filters"),
      values: builder.filters
        .filter((filter) => filter.field && filter.operator)
        .map((filter, index) => {
          const logic = index === 0 ? "" : `${filter.logic || "AND"} `;
          const value = filter.value ? ` ${filter.value}` : "";
          return `${logic}${filter.field} ${filter.operator}${value}`.trim();
        }),
    },
    {
      label: translate("composer.review.sorting"),
      values: builder.sorts
        .filter((sort) => sort.field)
        .map((sort) => `${sort.field} ${sort.direction || "ASC"}`.trim()),
    },
    {
      label: translate("composer.review.limit"),
      values: builder.limit ? [builder.limit] : [],
    },
    {
      label: translate("composer.review.child_queries"),
      values: builder.childQueries
        .filter((child) => child.relationship)
        .map((child) => {
          const parts = [child.relationship];
          if (child.fields) {
            parts.push(`(${child.fields})`);
          }
          const extras = [];
          if (child.where) extras.push(`WHERE ${child.where}`);
          if (child.order) extras.push(`ORDER BY ${child.order}`);
          if (child.limit) extras.push(`LIMIT ${child.limit}`);
          if (extras.length) {
            parts.push(extras.join(" "));
          }
          return parts.join(" ");
        }),
    },
  ];

  reviewItems.forEach((item) => {
    const col = document.createElement("div");
    col.className = "col-12 col-md-6";
    const card = document.createElement("div");
    card.className = "composer-card";
    const title = document.createElement("h6");
    title.className = "mb-2";
    title.textContent = item.label;
    card.appendChild(title);
    if (!item.values.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted small mb-0";
      empty.textContent = translate("composer.review.empty");
      card.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "list-unstyled small mb-0";
      item.values.forEach((value) => {
        const li = document.createElement("li");
        li.textContent = value;
        list.appendChild(li);
      });
      card.appendChild(list);
    }
    col.appendChild(card);
    container.appendChild(col);
  });
}

function buildComposerChildQuery(child) {
  const relationship = (child.relationship || "").trim();
  if (!relationship) {
    return null;
  }
  const fields = (child.fields || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = [];
  parts.push(`SELECT ${fields.length ? fields.join(", ") : "Id"}`);
  parts.push(`FROM ${relationship}`);
  if (child.where && child.where.trim()) {
    parts.push(`WHERE ${child.where.trim()}`);
  }
  if (child.order && child.order.trim()) {
    parts.push(`ORDER BY ${child.order.trim()}`);
  }
  if (child.limit && child.limit.trim()) {
    parts.push(`LIMIT ${child.limit.trim()}`);
  }
  return `(${parts.join(" ")})`;
}

function buildQueryFromComposer() {
  const builder = state.queryBuilder;
  const baseObject = (builder.baseObject || "").trim();
  if (!baseObject) {
    return "";
  }
  const lines = [];
  if (builder.useCount) {
    lines.push("SELECT COUNT()");
  } else {
    const selectParts = builder.selectedFields.slice();
    builder.childQueries.forEach((child) => {
      const fragment = buildComposerChildQuery(child);
      if (fragment) {
        selectParts.push(fragment);
      }
    });
    if (!selectParts.length) {
      selectParts.push("Id");
    }
    lines.push(`SELECT ${selectParts.join(", ")}`);
  }
  lines.push(`FROM ${baseObject}`);

  const filters = builder.filters.filter((filter) => filter.field && filter.operator);
  if (filters.length) {
    filters.forEach((filter, index) => {
      const value = filter.value ? ` ${filter.value}` : "";
      if (index === 0) {
        lines.push(`WHERE ${filter.field} ${filter.operator}${value}`.trim());
      } else {
        const logic = filter.logic || "AND";
        lines.push(`  ${logic} ${filter.field} ${filter.operator}${value}`.trim());
      }
    });
  }

  const sorts = builder.sorts.filter((sort) => sort.field);
  if (sorts.length) {
    const orderParts = sorts.map((sort) => `${sort.field} ${sort.direction || "ASC"}`.trim());
    lines.push(`ORDER BY ${orderParts.join(", ")}`);
  }

  if (builder.limit && builder.limit.trim()) {
    lines.push(`LIMIT ${builder.limit.trim()}`);
  }

  return lines.join("\n");
}

function updateQueryComposerPreview() {
  const previewElement = document.getElementById("query-composer-preview");
  const copyButton = document.getElementById("query-composer-copy");
  if (!previewElement) return;
  const query = buildQueryFromComposer();
  previewElement.textContent = query || "";
  if (copyButton) {
    copyButton.disabled = !query;
  }
}

function canProceedFromComposerStep(step, options = {}) {
  const showFeedback = options?.showFeedback ?? false;
  if (step === 0) {
    if (!state.queryBuilder.baseObject) {
      if (showFeedback) {
        showToast(translate("composer.messages.base_object_required"), "warning");
      }
      return false;
    }
  } else if (step === 1) {
    if (!state.queryBuilder.useCount && !state.queryBuilder.selectedFields.length) {
      if (showFeedback) {
        showToast(translate("composer.messages.fields_required"), "warning");
      }
      return false;
    }
  }
  return true;
}

function updateQueryComposerStepIndicator() {
  const step = state.queryBuilder.step;
  document.querySelectorAll(".query-composer-step").forEach((section) => {
    const sectionStep = Number(section.dataset.step);
    section.classList.toggle("active", sectionStep === step);
  });
  document.querySelectorAll("#query-composer-stepper .query-composer-step-button").forEach((button) => {
    const buttonStep = Number(button.dataset.step);
    button.classList.toggle("active", buttonStep === step);
    button.disabled = buttonStep > step + 1;
  });
}

function updateQueryComposerNavigation() {
  const step = state.queryBuilder.step;
  const lastStep = QUERY_COMPOSER_STEPS.length - 1;
  const backButton = document.getElementById("query-composer-back");
  const nextButton = document.getElementById("query-composer-next");
  const finishButton = document.getElementById("query-composer-finish");
  if (backButton) {
    backButton.disabled = step === 0;
  }
  const canProceed = canProceedFromComposerStep(step, { showFeedback: false });
  if (nextButton) {
    nextButton.classList.toggle("d-none", step === lastStep);
    nextButton.disabled = step === lastStep || !canProceed;
  }
  if (finishButton) {
    finishButton.classList.toggle("d-none", step !== lastStep);
    finishButton.disabled = step !== lastStep || !canProceedFromComposerStep(step, { showFeedback: false });
  }
}

function handleQueryComposerBack() {
  if (state.queryBuilder.step === 0) {
    return;
  }
  state.queryBuilder.step -= 1;
  updateQueryComposerStepIndicator();
  updateQueryComposerNavigation();
}

function handleQueryComposerNext() {
  if (!canProceedFromComposerStep(state.queryBuilder.step, { showFeedback: true })) {
    return;
  }
  if (state.queryBuilder.step < QUERY_COMPOSER_STEPS.length - 1) {
    state.queryBuilder.step += 1;
    updateQueryComposerStepIndicator();
    updateQueryComposerNavigation();
  }
}

function handleQueryComposerFinish() {
  if (!canProceedFromComposerStep(state.queryBuilder.step, { showFeedback: true })) {
    return;
  }
  const query = buildQueryFromComposer();
  if (!query) {
    showToast(translate("composer.messages.base_object_required"), "warning");
    return;
  }
  const textarea = document.getElementById("soql-query");
  if (textarea) {
    textarea.value = query;
    applyKeywordFormatting(textarea, { preserveCursor: true });
    refreshQueryEditorState();
  }
  showToast(translate("composer.messages.insert_success"), "success");
  if (queryComposerModal) {
    queryComposerModal.hide();
  }
}

function hydrateQueryComposerFromEditor() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const rawQuery = textarea.value || "";
  if (!rawQuery.trim()) {
    return;
  }
  const builder = state.queryBuilder;
  const objectName = extractObjectNameFromQuery(rawQuery);
  if (objectName) {
    builder.baseObject = objectName;
  }
  const fields = getSelectFields(rawQuery);
  if (fields.length) {
    const hasCount = fields.some((field) => /^count\s*\(/i.test(field));
    if (hasCount) {
      builder.useCount = true;
      builder.selectedFields = [];
    } else {
      const topLevelFields = fields.filter((field) => !field.trim().startsWith("("));
      if (topLevelFields.length) {
        builder.selectedFields = topLevelFields;
      }
    }
  }
  const limitMatch = rawQuery.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    builder.limit = limitMatch[1];
  }
  const orderMatch = rawQuery.match(/\bORDER\s+BY\s+([^\n]+?)(?:\bLIMIT\b|$)/i);
  if (orderMatch) {
    const parts = orderMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    builder.sorts = parts.map((part) => {
      const [field, direction] = part.split(/\s+/);
      return createComposerSort({ field, direction: direction?.toUpperCase() === "DESC" ? "DESC" : "ASC" });
    });
  }
}

function copyQueryComposerPreview() {
  const query = buildQueryFromComposer();
  if (!query) {
    showToast(translate("composer.messages.base_object_required"), "warning");
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(query)
      .then(() => showToast(translate("composer.messages.copy_success"), "success"))
      .catch(() => fallbackCopyComposerQuery(query));
    return;
  }
  fallbackCopyComposerQuery(query);
}

function fallbackCopyComposerQuery(text) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showToast(translate("composer.messages.copy_success"), "success");
  } catch (error) {
    showToast(translate("composer.messages.copy_failed"), "danger");
  }
}

function updateQueryComposerAvailability() {
  const openButton = document.getElementById("query-composer-open");
  if (!openButton) return;
  openButton.disabled = !state.selectedOrg;
}

async function openQueryComposer() {
  resetQueryComposerState();
  setQueryComposerTemplate(state.queryBuilder.template || "blank", { silent: true });
  hydrateQueryComposerFromEditor();
  renderQueryComposerTemplates();
  renderQueryComposerSelectedFields();
  renderQueryComposerFilters();
  renderQueryComposerSorts();
  renderQueryComposerChildren();
  renderQueryComposerReview();
  updateQueryComposerStepIndicator();
  updateQueryComposerNavigation();
  if (state.queryBuilder.baseObject) {
    await setQueryComposerBaseObject(state.queryBuilder.baseObject);
  } else {
    renderQueryComposerAvailableFields();
    updateQueryComposerPreview();
  }
  const modalElement = document.getElementById("query-composer-modal");
  if (modalElement && !queryComposerModal) {
    queryComposerModal = new bootstrap.Modal(modalElement, { focus: true });
  }
  updateQueryComposerPreview();
  updateQueryComposerNavigation();
  const limitInput = document.getElementById("query-composer-limit");
  if (limitInput) {
    limitInput.value = state.queryBuilder.limit || "";
  }
  if (queryComposerModal) {
    queryComposerModal.show();
  }
}

function initializeQueryComposer() {
  const openButton = document.getElementById("query-composer-open");
  const modalElement = document.getElementById("query-composer-modal");
  if (!openButton || !modalElement) {
    return;
  }

  queryComposerModal = new bootstrap.Modal(modalElement, { focus: true });

  openButton.addEventListener("click", () => {
    openQueryComposer();
  });

  modalElement.addEventListener("hidden.bs.modal", () => {
    state.queryBuilder.step = 0;
    updateQueryComposerStepIndicator();
    updateQueryComposerNavigation();
  });

  const stepper = document.getElementById("query-composer-stepper");
  if (stepper) {
    stepper.addEventListener("click", (event) => {
      const button = event.target.closest(".query-composer-step-button");
      if (!button) return;
      const targetStep = Number(button.dataset.step);
      if (Number.isNaN(targetStep) || targetStep === state.queryBuilder.step) {
        return;
      }
      if (targetStep < state.queryBuilder.step) {
        state.queryBuilder.step = targetStep;
        updateQueryComposerStepIndicator();
        updateQueryComposerNavigation();
      } else {
        if (!canProceedFromComposerStep(state.queryBuilder.step, { showFeedback: true })) {
          return;
        }
        state.queryBuilder.step = Math.min(targetStep, QUERY_COMPOSER_STEPS.length - 1);
        updateQueryComposerStepIndicator();
        updateQueryComposerNavigation();
      }
    });
  }

  const baseObjectInput = document.getElementById("query-composer-base-object");
  if (baseObjectInput) {
    baseObjectInput.addEventListener("change", (event) => {
      setQueryComposerBaseObject(event.target.value);
    });
    baseObjectInput.addEventListener("blur", (event) => {
      if (event.target.value !== state.queryBuilder.baseObject) {
        setQueryComposerBaseObject(event.target.value);
      }
    });
  }

  const fieldFilterInput = document.getElementById("query-composer-field-filter");
  if (fieldFilterInput) {
    fieldFilterInput.addEventListener("input", (event) => {
      state.queryBuilder.fieldFilter = event.target.value || "";
      renderQueryComposerAvailableFields();
    });
  }

  const useCountToggle = document.getElementById("query-composer-use-count");
  if (useCountToggle) {
    useCountToggle.addEventListener("change", (event) => {
      state.queryBuilder.useCount = event.target.checked;
      renderQueryComposerSelectedFields();
      renderQueryComposerReview();
      updateQueryComposerPreview();
      updateQueryComposerNavigation();
    });
  }

  const customFieldInput = document.getElementById("query-composer-custom-field");
  const customFieldButton = document.getElementById("query-composer-add-custom-field");
  if (customFieldInput) {
    customFieldInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addFieldToComposer(customFieldInput.value);
        customFieldInput.value = "";
      }
    });
  }
  if (customFieldButton) {
    customFieldButton.addEventListener("click", () => {
      if (!customFieldInput) return;
      addFieldToComposer(customFieldInput.value);
      customFieldInput.value = "";
    });
  }

  const addFilterButton = document.getElementById("query-composer-add-filter");
  if (addFilterButton) {
    addFilterButton.addEventListener("click", () => addComposerFilter());
  }

  const addSortButton = document.getElementById("query-composer-add-sort");
  if (addSortButton) {
    addSortButton.addEventListener("click", () => addComposerSort());
  }

  const addChildButton = document.getElementById("query-composer-add-child");
  if (addChildButton) {
    addChildButton.addEventListener("click", () => addComposerChild());
  }

  const limitInput = document.getElementById("query-composer-limit");
  if (limitInput) {
    limitInput.addEventListener("input", (event) => {
      state.queryBuilder.limit = event.target.value || "";
      renderQueryComposerReview();
      updateQueryComposerPreview();
    });
  }

  const backButton = document.getElementById("query-composer-back");
  if (backButton) {
    backButton.addEventListener("click", handleQueryComposerBack);
  }

  const nextButton = document.getElementById("query-composer-next");
  if (nextButton) {
    nextButton.addEventListener("click", handleQueryComposerNext);
  }

  const finishButton = document.getElementById("query-composer-finish");
  if (finishButton) {
    finishButton.addEventListener("click", handleQueryComposerFinish);
  }

  const copyButton = document.getElementById("query-composer-copy");
  if (copyButton) {
    copyButton.addEventListener("click", copyQueryComposerPreview);
  }

  updateQueryComposerStepIndicator();
  updateQueryComposerNavigation();
  updateQueryComposerAvailability();
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
  initializeQueryComposer();
  if (!state.selectedOrg) {
    loadMetadataForSelectedOrg();
  }
});
