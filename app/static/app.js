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

const STORAGE_PREFIX = "sfint";
const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}.settings`,
  savedQueries: `${STORAGE_PREFIX}.savedQueries`,
  selectedOrg: `${STORAGE_PREFIX}.selectedOrg`,
  queryDraft: `${STORAGE_PREFIX}.queryDraft`,
};

const QUERY_COMPOSER_OPERATORS = [
  "=",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "LIKE",
  "NOT LIKE",
  "IN",
  "NOT IN",
  "INCLUDES",
  "EXCLUDES",
  "CONTAINS",
  "STARTS WITH",
  "ENDS WITH",
];

const QUERY_COMPOSER_LOGICAL_OPERATORS = ["AND", "OR"];
const QUERY_COMPOSER_NULLS_OPTIONS = ["", "FIRST", "LAST"];
const QUERY_COMPOSER_FOR_OPTIONS = ["", "FOR VIEW", "FOR UPDATE"];

function createEmptyComposerCondition(logical = "AND") {
  return {
    field: "",
    operator: "=",
    value: "",
    logical,
  };
}

function createEmptyComposerOrder() {
  return {
    field: "",
    direction: "ASC",
    nulls: "",
  };
}

function createEmptyComposerChildQuery() {
  return {
    relationship: "",
    fields: [],
    where: "",
    orderBy: "",
    limit: "",
    offset: "",
  };
}

const queryComposerState = {
  queryType: "basic",
  objectName: "",
  fields: [],
  conditions: [createEmptyComposerCondition()],
  groupBy: [],
  having: [],
  orderBy: [],
  childQueries: [],
  limit: "",
  offset: "",
  distinct: false,
  securityEnforced: false,
  usingScope: "",
  forClause: "",
  lastAppliedTemplate: null,
};

let queryComposerModalInstance = null;

const QUERY_COMPOSER_TEMPLATES = [
  {
    id: "recent_records",
    type: "basic",
    labelKey: "index.query.composer.templates.items.recent_records.label",
    descriptionKey: "index.query.composer.templates.items.recent_records.description",
    apply: (currentState) => {
      const baseObject =
        currentState.objectName || state.metadata.selectedObject || "Account";
      return {
        queryType: "basic",
        objectName: baseObject,
        fields: ["Id", "Name", "CreatedDate"],
        conditions: [
          {
            field: "CreatedDate",
            operator: ">=",
            value: "LAST_N_DAYS:30",
            logical: "AND",
          },
        ],
        orderBy: [{ field: "CreatedDate", direction: "DESC", nulls: "" }],
        limit: "50",
        offset: "",
        distinct: false,
      };
    },
  },
  {
    id: "top_opportunities",
    type: "aggregate",
    labelKey: "index.query.composer.templates.items.top_opportunities.label",
    descriptionKey:
      "index.query.composer.templates.items.top_opportunities.description",
    apply: (currentState) => {
      const baseObject = currentState.objectName || "Opportunity";
      return {
        queryType: "aggregate",
        objectName: baseObject,
        fields: ["StageName", "SUM(Amount) total", "COUNT(Id) cnt"],
        groupBy: ["StageName"],
        having: [
          {
            field: "SUM(Amount)",
            operator: ">",
            value: "100000",
            logical: "AND",
          },
        ],
        orderBy: [{ field: "total", direction: "DESC", nulls: "" }],
        limit: "10",
        offset: "",
      };
    },
  },
  {
    id: "child_opportunities",
    type: "relationship",
    labelKey: "index.query.composer.templates.items.child_opportunities.label",
    descriptionKey:
      "index.query.composer.templates.items.child_opportunities.description",
    apply: (currentState) => {
      const baseObject = currentState.objectName || "Account";
      return {
        queryType: "relationship",
        objectName: baseObject,
        fields: ["Id", "Name"],
        childQueries: [
          {
            relationship: "Opportunities",
            fields: ["Id", "Name", "Amount", "CloseDate"],
            where: "StageName = 'Closed Won'",
            orderBy: "CloseDate DESC",
            limit: "5",
            offset: "",
          },
        ],
        conditions: [
          {
            field: "Industry",
            operator: "=",
            value: "'Technology'",
            logical: "AND",
          },
        ],
        orderBy: [{ field: "Name", direction: "ASC", nulls: "" }],
      };
    },
  },
  {
    id: "typeof_events",
    type: "typeof",
    labelKey: "index.query.composer.templates.items.typeof_events.label",
    descriptionKey:
      "index.query.composer.templates.items.typeof_events.description",
    apply: (currentState) => {
      const baseObject = currentState.objectName || "Event";
      return {
        queryType: "typeof",
        objectName: baseObject,
        fields: [
          "Id",
          "TYPEOF What WHEN Account THEN Phone, Industry WHEN Opportunity THEN Amount END",
          "Subject",
          "ActivityDate",
        ],
        limit: "50",
        offset: "",
      };
    },
  },
];

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
  state.metadata.fields = {};
  state.metadata.selectedObject = null;
  state.metadata.filter = "";
  renderObjectList();
  renderFieldList([]);
  updateFieldSuggestions();
  resetQueryComposerState({ keepObject: false, silent: true });
  updateComposerObjectOptions();
  updateComposerFieldOptions();
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
    updateComposerObjectOptions();
    updateComposerPreview();
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
  updateComposerFieldOptions();
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

function getQueryComposerModal() {
  const element = document.getElementById("query-composer-modal");
  if (!element) {
    return null;
  }
  queryComposerModalInstance = bootstrap.Modal.getOrCreateInstance(element);
  return queryComposerModalInstance;
}

function ensureComposerMetadataForObject(objectName) {
  if (!objectName) return;
  if (state.metadata.selectedObject === objectName) {
    if (!state.metadata.fields[objectName]) {
      loadFieldsForObject(objectName);
    } else {
      updateComposerFieldOptions();
    }
    return;
  }
  selectObject(objectName, { silent: true });
}

function setComposerObjectName(objectName, options = {}) {
  const { updateUI = true } = options;
  const normalized = typeof objectName === "string" ? objectName.trim() : "";
  queryComposerState.objectName = normalized;
  if (normalized) {
    ensureComposerMetadataForObject(normalized);
  } else {
    updateComposerFieldOptions();
  }
  if (updateUI) {
    updateQueryComposerUI();
  } else {
    updateComposerPreview();
  }
}

function resetQueryComposerState(options = {}) {
  const { keepObject = false, silent = false } = options;
  const preservedObject = keepObject ? queryComposerState.objectName : "";
  queryComposerState.queryType = "basic";
  queryComposerState.fields = [];
  queryComposerState.conditions = [createEmptyComposerCondition()];
  queryComposerState.groupBy = [];
  queryComposerState.having = [];
  queryComposerState.orderBy = [];
  queryComposerState.childQueries = [];
  queryComposerState.limit = "";
  queryComposerState.offset = "";
  queryComposerState.distinct = false;
  queryComposerState.securityEnforced = false;
  queryComposerState.usingScope = "";
  queryComposerState.forClause = "";
  queryComposerState.lastAppliedTemplate = null;
  if (keepObject) {
    queryComposerState.objectName = preservedObject;
    if (preservedObject) {
      ensureComposerMetadataForObject(preservedObject);
    }
  } else {
    queryComposerState.objectName = "";
    updateComposerFieldOptions();
  }
  if (!silent) {
    updateQueryComposerUI();
  } else {
    updateComposerPreview();
  }
}

function updateComposerObjectOptions() {
  const datalist = document.getElementById("query-composer-object-options");
  if (!datalist) return;
  if (!Array.isArray(state.metadata.objects) || !state.metadata.objects.length) {
    datalist.innerHTML = "";
    return;
  }
  const options = state.metadata.objects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((object) => {
      const label =
        object.label && object.label !== object.name
          ? `${object.name} (${object.label})`
          : object.name;
      return `<option value="${escapeHtml(object.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  datalist.innerHTML = options;
}

function updateComposerFieldOptions() {
  const datalist = document.getElementById("query-composer-field-options");
  if (!datalist) return;
  const objectName = queryComposerState.objectName || state.metadata.selectedObject;
  if (!objectName || !state.metadata.fields[objectName]) {
    datalist.innerHTML = "";
    return;
  }
  const options = state.metadata.fields[objectName]
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((field) => {
      const label =
        field.label && field.label !== field.name
          ? `${field.name} (${field.label})`
          : field.name;
      return `<option value="${escapeHtml(field.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  datalist.innerHTML = options;
}

function renderComposerPillList(containerId, items, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { emptyKey = null, removeAction = "", getLabel = null, getAriaLabel = null } = options;
  if (!Array.isArray(items) || !items.length) {
    if (emptyKey) {
      container.innerHTML = `<p class="text-muted small mb-0">${translate(emptyKey)}</p>`;
    } else {
      container.innerHTML = "";
    }
    return;
  }
  container.innerHTML = items
    .map((item, index) => {
      const label = getLabel ? getLabel(item, index) : item;
      const aria = getAriaLabel
        ? getAriaLabel(item, index)
        : translate("index.query.composer.actions.remove_item");
      return `
        <div class="query-composer-pill" data-index="${index}">
          <span class="query-composer-pill-text">${escapeHtml(label)}</span>
          <button
            type="button"
            class="btn-close btn-close-white query-composer-pill-remove"
            data-composer-action="${removeAction}"
            data-index="${index}"
            aria-label="${escapeHtml(aria)}"
          ></button>
        </div>
      `;
    })
    .join("");
}

function renderQueryComposerFields() {
  renderComposerPillList("query-composer-fields", queryComposerState.fields, {
    emptyKey: "index.query.composer.fields.empty",
    removeAction: "remove-field",
    getAriaLabel: (value) => translate("index.query.composer.fields.remove", { field: value }),
  });
}

function renderQueryComposerGroupFields() {
  renderComposerPillList("query-composer-group-fields", queryComposerState.groupBy, {
    emptyKey: "index.query.composer.group_by.empty",
    removeAction: "remove-group-field",
    getAriaLabel: (value) => translate("index.query.composer.group_by.remove", { field: value }),
  });
}

function renderComposerConditionList(list, options) {
  const {
    containerId,
    group,
    emptyKey,
    removeAction,
    removeLabelKey,
    fieldPlaceholderKey,
    valuePlaceholderKey,
  } = options;
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!Array.isArray(list) || !list.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate(emptyKey)}</p>`;
    return;
  }
  container.innerHTML = list
    .map((condition, index) => {
      const fieldValue = typeof condition.field === "string" ? condition.field : "";
      const operatorValue = typeof condition.operator === "string" ? condition.operator : "=";
      const logicalValue = typeof condition.logical === "string" ? condition.logical : "AND";
      const valueValue = typeof condition.value === "string" ? condition.value : "";
      const operatorOptions = QUERY_COMPOSER_OPERATORS.map((operator) => {
        const isSelected = operatorValue.toUpperCase() === operator;
        return `<option value="${operator}"${isSelected ? " selected" : ""}>${operator}</option>`;
      }).join("");
      const logicalOptions = QUERY_COMPOSER_LOGICAL_OPERATORS.map((logical) => {
        const isSelected = logicalValue.toUpperCase() === logical;
        return `<option value="${logical}"${isSelected ? " selected" : ""}>${logical}</option>`;
      }).join("");
      const logicalControl = index === 0
        ? ""
        : `
            <div class="col-12 col-lg-2">
              <label class="form-label form-label-sm">${translate("index.query.composer.conditions.logical_label")}</label>
              <select
                class="form-select form-select-sm"
                data-condition-group="${group}"
                data-condition-field="logical"
                data-condition-index="${index}"
              >
                ${logicalOptions}
              </select>
            </div>
          `;
      return `
        <div class="query-composer-condition" data-condition-index="${index}">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-lg-4">
              <label class="form-label form-label-sm">${translate(fieldPlaceholderKey)}</label>
              <input
                type="text"
                class="form-control form-control-sm"
                list="query-composer-field-options"
                data-condition-group="${group}"
                data-condition-field="field"
                data-condition-index="${index}"
                value="${escapeHtml(fieldValue)}"
                placeholder="${translate(fieldPlaceholderKey)}"
                autocomplete="off"
              />
            </div>
            <div class="col-6 col-lg-2">
              <label class="form-label form-label-sm">${translate("index.query.composer.conditions.operator_label")}</label>
              <select
                class="form-select form-select-sm"
                data-condition-group="${group}"
                data-condition-field="operator"
                data-condition-index="${index}"
              >
                ${operatorOptions}
              </select>
            </div>
            <div class="col-12 col-lg-4">
              <label class="form-label form-label-sm">${translate(valuePlaceholderKey)}</label>
              <input
                type="text"
                class="form-control form-control-sm"
                data-condition-group="${group}"
                data-condition-field="value"
                data-condition-index="${index}"
                value="${escapeHtml(valueValue)}"
                placeholder="${translate(valuePlaceholderKey)}"
              />
            </div>
            <div class="col-6 col-lg-2 text-end">
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                data-composer-action="${removeAction}"
                data-condition-group="${group}"
                data-index="${index}"
                aria-label="${translate(removeLabelKey)}"
              >
                &times;
              </button>
            </div>
          </div>
          ${logicalControl}
        </div>
      `;
    })
    .join("");
}

function renderQueryComposerConditions() {
  renderComposerConditionList(queryComposerState.conditions, {
    containerId: "query-composer-conditions",
    group: "conditions",
    emptyKey: "index.query.composer.conditions.empty",
    removeAction: "remove-condition",
    removeLabelKey: "index.query.composer.conditions.remove",
    fieldPlaceholderKey: "index.query.composer.conditions.field_placeholder",
    valuePlaceholderKey: "index.query.composer.conditions.value_placeholder",
  });
}

function renderQueryComposerHaving() {
  renderComposerConditionList(queryComposerState.having, {
    containerId: "query-composer-having",
    group: "having",
    emptyKey: "index.query.composer.having.empty",
    removeAction: "remove-having",
    removeLabelKey: "index.query.composer.having.remove",
    fieldPlaceholderKey: "index.query.composer.having.field_placeholder",
    valuePlaceholderKey: "index.query.composer.having.value_placeholder",
  });
}

function renderQueryComposerOrder() {
  const container = document.getElementById("query-composer-order");
  if (!container) return;
  if (!Array.isArray(queryComposerState.orderBy) || !queryComposerState.orderBy.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate("index.query.composer.order_by.empty")}</p>`;
    return;
  }
  container.innerHTML = queryComposerState.orderBy
    .map((order, index) => {
      const fieldValue = typeof order.field === "string" ? order.field : "";
      const directionValue = (order.direction || "ASC").toUpperCase();
      const nullsValue = (order.nulls || "").toUpperCase();
      const directionOptions = [
        { value: "ASC", label: translate("index.query.composer.order_by.direction.asc") },
        { value: "DESC", label: translate("index.query.composer.order_by.direction.desc") },
      ]
        .map((item) => `<option value="${item.value}"${directionValue === item.value ? " selected" : ""}>${item.label}</option>`)
        .join("");
      const nullsOptions = [
        { value: "", label: translate("index.query.composer.order_by.nulls.default") },
        { value: "FIRST", label: translate("index.query.composer.order_by.nulls.first") },
        { value: "LAST", label: translate("index.query.composer.order_by.nulls.last") },
      ]
        .map((item) => `<option value="${item.value}"${nullsValue === item.value ? " selected" : ""}>${item.label}</option>`)
        .join("");
      return `
        <div class="query-composer-order-item" data-order-index="${index}">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-lg-5">
              <label class="form-label form-label-sm">${translate("index.query.composer.order_by.field_placeholder")}</label>
              <input
                type="text"
                class="form-control form-control-sm"
                list="query-composer-field-options"
                data-order-index="${index}"
                data-order-field="field"
                value="${escapeHtml(fieldValue)}"
                placeholder="${translate("index.query.composer.order_by.field_placeholder")}" 
                autocomplete="off"
              />
            </div>
            <div class="col-6 col-lg-3">
              <label class="form-label form-label-sm">${translate("index.query.composer.order_by.direction_label")}</label>
              <select
                class="form-select form-select-sm"
                data-order-index="${index}"
                data-order-field="direction"
              >
                ${directionOptions}
              </select>
            </div>
            <div class="col-6 col-lg-3">
              <label class="form-label form-label-sm">${translate("index.query.composer.order_by.nulls_label")}</label>
              <select
                class="form-select form-select-sm"
                data-order-index="${index}"
                data-order-field="nulls"
              >
                ${nullsOptions}
              </select>
            </div>
            <div class="col-12 col-lg-1 text-end">
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                data-composer-action="remove-order"
                data-index="${index}"
                aria-label="${translate("index.query.composer.order_by.remove")}" 
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderQueryComposerChildQueries() {
  const container = document.getElementById("query-composer-children");
  if (!container) return;
  if (!Array.isArray(queryComposerState.childQueries) || !queryComposerState.childQueries.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate("index.query.composer.child_queries.empty")}</p>`;
    return;
  }
  container.innerHTML = queryComposerState.childQueries
    .map((child, index) => {
      const label = translate("index.query.composer.child_queries.child_label", { index: index + 1 });
      const fields = Array.isArray(child.fields) ? child.fields : [];
      const fieldsMarkup = fields.length
        ? fields
            .map((field, fieldIndex) => `
                <div class="query-composer-pill" data-child-index="${index}" data-field-index="${fieldIndex}">
                  <span class="query-composer-pill-text">${escapeHtml(field)}</span>
                  <button
                    type="button"
                    class="btn-close btn-close-white query-composer-pill-remove"
                    data-composer-action="remove-child-field"
                    data-child-index="${index}"
                    data-field-index="${fieldIndex}"
                    aria-label="${translate("index.query.composer.child_queries.remove_field", { field })}"
                  ></button>
                </div>
              `)
            .join("")
        : `<p class="text-muted small mb-0">${translate("index.query.composer.child_queries.empty_fields")}</p>`;
      return `
        <div class="query-composer-child card card-body" data-child-index="${index}">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h6 class="mb-0">${escapeHtml(label)}</h6>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              data-composer-action="remove-child"
              data-index="${index}"
            >
              ${translate("index.query.composer.child_queries.remove")}
            </button>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-12 col-md-6">
              <label class="form-label" for="query-composer-child-relationship-${index}">${translate("index.query.composer.child_queries.relationship_label")}</label>
              <input
                type="text"
                class="form-control"
                id="query-composer-child-relationship-${index}"
                data-child-index="${index}"
                data-child-field="relationship"
                value="${escapeHtml(child.relationship || "")}" 
                placeholder="${translate("index.query.composer.child_queries.relationship_placeholder")}" 
              />
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="query-composer-child-field-input-${index}">${translate("index.query.composer.child_queries.fields_label")}</label>
              <div class="input-group">
                <input
                  type="text"
                  class="form-control"
                  id="query-composer-child-field-input-${index}"
                  list="query-composer-field-options"
                  data-child-index="${index}"
                  data-child-field="field-input"
                  placeholder="${translate("index.query.composer.child_queries.field_placeholder")}" 
                  autocomplete="off"
                />
                <button
                  class="btn btn-outline-secondary"
                  type="button"
                  data-composer-action="child-add-field"
                  data-index="${index}"
                >
                  ${translate("index.query.composer.child_queries.add_field")}
                </button>
              </div>
            </div>
          </div>
          <div class="query-composer-pill-list" data-child-index="${index}" data-role="child-fields">
            ${fieldsMarkup}
          </div>
          <div class="row g-2 mt-2">
            <div class="col-12 col-md-6">
              <label class="form-label" for="query-composer-child-where-${index}">${translate("index.query.composer.child_queries.where_label")}</label>
              <textarea
                id="query-composer-child-where-${index}"
                class="form-control"
                rows="2"
                data-child-index="${index}"
                data-child-field="where"
              >${escapeHtml(child.where || "")}</textarea>
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="query-composer-child-order-${index}">${translate("index.query.composer.child_queries.order_label")}</label>
              <textarea
                id="query-composer-child-order-${index}"
                class="form-control"
                rows="2"
                data-child-index="${index}"
                data-child-field="orderBy"
              >${escapeHtml(child.orderBy || "")}</textarea>
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="query-composer-child-limit-${index}">${translate("index.query.composer.child_queries.limit_label")}</label>
              <input
                type="number"
                min="0"
                class="form-control"
                id="query-composer-child-limit-${index}"
                data-child-index="${index}"
                data-child-field="limit"
                value="${escapeHtml(child.limit || "")}" 
              />
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="query-composer-child-offset-${index}">${translate("index.query.composer.child_queries.offset_label")}</label>
              <input
                type="number"
                min="0"
                class="form-control"
                id="query-composer-child-offset-${index}"
                data-child-index="${index}"
                data-child-field="offset"
                value="${escapeHtml(child.offset || "")}" 
              />
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderQueryComposerTemplates() {
  const container = document.getElementById("query-composer-templates");
  if (!container) return;
  if (!Array.isArray(QUERY_COMPOSER_TEMPLATES) || !QUERY_COMPOSER_TEMPLATES.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${translate("index.query.composer.templates.empty")}</p>`;
    return;
  }
  container.innerHTML = QUERY_COMPOSER_TEMPLATES.map((template) => {
    const label = translate(template.labelKey);
    const description = translate(template.descriptionKey);
    const isActive = queryComposerState.lastAppliedTemplate === template.id;
    return `
      <button
        type="button"
        class="list-group-item list-group-item-action text-start${isActive ? " active" : ""}"
        data-composer-action="apply-template"
        data-template="${template.id}"
      >
        <div class="fw-semibold">${escapeHtml(label)}</div>
        <div class="small${isActive ? " text-white-50" : " text-muted"}">${escapeHtml(description)}</div>
      </button>
    `;
  }).join("");
}

function addComposerField(value, options = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return;
  }
  const exists = queryComposerState.fields.some(
    (field) => field.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) {
    if (!options?.silent) {
      showToast(translate("toast.composer_field_exists", { field: normalized }), "info");
    }
    return;
  }
  queryComposerState.fields.push(normalized);
  updateQueryComposerUI();
}

function removeComposerField(index) {
  if (!Array.isArray(queryComposerState.fields)) return;
  queryComposerState.fields.splice(index, 1);
  updateQueryComposerUI();
}

function addComposerAggregate(func, field, alias) {
  const functionName = (typeof func === "string" ? func : "COUNT").toUpperCase();
  const fieldName = typeof field === "string" && field.trim() ? field.trim() : "";
  if (!fieldName && functionName !== "COUNT") {
    showToast(translate("toast.composer_field_required"), "warning");
    return;
  }
  const expression = `${functionName}(${fieldName || "Id"})`;
  const aliasPart = typeof alias === "string" && alias.trim() ? ` ${alias.trim()}` : "";
  addComposerField(`${expression}${aliasPart}`);
}

function addComposerCondition() {
  queryComposerState.conditions.push(createEmptyComposerCondition());
  updateQueryComposerUI();
}

function removeComposerCondition(index) {
  if (!Array.isArray(queryComposerState.conditions)) return;
  queryComposerState.conditions.splice(index, 1);
  updateQueryComposerUI();
}

function addComposerHaving() {
  queryComposerState.having.push(createEmptyComposerCondition());
  updateQueryComposerUI();
}

function removeComposerHaving(index) {
  if (!Array.isArray(queryComposerState.having)) return;
  queryComposerState.having.splice(index, 1);
  updateQueryComposerUI();
}

function updateComposerCondition(group, index, key, value) {
  const target = group === "having" ? queryComposerState.having : queryComposerState.conditions;
  if (!Array.isArray(target) || !target[index]) return;
  const entry = target[index];
  if (key === "logical") {
    entry.logical = (value || "AND").toUpperCase();
  } else if (key === "operator") {
    entry.operator = (value || "=").toUpperCase();
  } else if (key === "field") {
    entry.field = typeof value === "string" ? value : "";
  } else if (key === "value") {
    entry.value = typeof value === "string" ? value : "";
  }
  updateComposerPreview();
}

function addComposerGroupField(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return;
  }
  const exists = queryComposerState.groupBy.some(
    (field) => field.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) {
    showToast(translate("toast.composer_group_exists", { field: normalized }), "info");
    return;
  }
  queryComposerState.groupBy.push(normalized);
  updateQueryComposerUI();
}

function removeComposerGroupField(index) {
  if (!Array.isArray(queryComposerState.groupBy)) return;
  queryComposerState.groupBy.splice(index, 1);
  updateQueryComposerUI();
}

function addComposerOrder() {
  queryComposerState.orderBy.push(createEmptyComposerOrder());
  updateQueryComposerUI();
}

function removeComposerOrder(index) {
  if (!Array.isArray(queryComposerState.orderBy)) return;
  queryComposerState.orderBy.splice(index, 1);
  updateQueryComposerUI();
}

function updateComposerOrder(index, key, value) {
  if (!Array.isArray(queryComposerState.orderBy) || !queryComposerState.orderBy[index]) {
    return;
  }
  const entry = queryComposerState.orderBy[index];
  if (key === "field") {
    entry.field = typeof value === "string" ? value : "";
  } else if (key === "direction") {
    const normalized = (value || "ASC").toUpperCase();
    entry.direction = normalized === "DESC" ? "DESC" : "ASC";
  } else if (key === "nulls") {
    const normalized = (value || "").toUpperCase();
    entry.nulls = QUERY_COMPOSER_NULLS_OPTIONS.includes(normalized) ? normalized : "";
  }
  updateComposerPreview();
}

function addComposerChild() {
  queryComposerState.childQueries.push(createEmptyComposerChildQuery());
  updateQueryComposerUI();
}

function removeComposerChild(index) {
  if (!Array.isArray(queryComposerState.childQueries)) return;
  queryComposerState.childQueries.splice(index, 1);
  updateQueryComposerUI();
}

function addComposerChildField(index, value) {
  if (!Array.isArray(queryComposerState.childQueries) || !queryComposerState.childQueries[index]) {
    return;
  }
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return;
  }
  const child = queryComposerState.childQueries[index];
  const fields = Array.isArray(child.fields) ? child.fields : (child.fields = []);
  const exists = fields.some((field) => field.toLowerCase() === normalized.toLowerCase());
  if (exists) {
    showToast(translate("toast.composer_child_field_exists", { field: normalized }), "info");
    return;
  }
  fields.push(normalized);
  updateQueryComposerUI();
}

function removeComposerChildField(index, fieldIndex) {
  if (!Array.isArray(queryComposerState.childQueries) || !queryComposerState.childQueries[index]) {
    return;
  }
  const child = queryComposerState.childQueries[index];
  if (!Array.isArray(child.fields)) {
    return;
  }
  child.fields.splice(fieldIndex, 1);
  updateQueryComposerUI();
}

function updateComposerChild(index, key, value) {
  if (!Array.isArray(queryComposerState.childQueries) || !queryComposerState.childQueries[index]) {
    return;
  }
  const child = queryComposerState.childQueries[index];
  if (key === "relationship") {
    child.relationship = typeof value === "string" ? value : "";
  } else if (key === "where") {
    child.where = typeof value === "string" ? value : "";
  } else if (key === "orderBy") {
    child.orderBy = typeof value === "string" ? value : "";
  } else if (key === "limit" || key === "offset") {
    child[key] = typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
  updateComposerPreview();
}

function buildComposerWhereClause(list) {
  if (!Array.isArray(list) || !list.length) {
    return "";
  }
  const clauses = [];
  list.forEach((condition, index) => {
    const field = typeof condition?.field === "string" ? condition.field.trim() : "";
    const operator = typeof condition?.operator === "string" ? condition.operator.trim() : "";
    const value = typeof condition?.value === "string" ? condition.value.trim() : "";
    let clause = "";
    if (field && operator && value) {
      clause = `${field} ${operator} ${value}`;
    } else if (field && operator) {
      clause = `${field} ${operator}`;
    } else if (!field && value) {
      clause = value;
    }
    if (!clause) {
      return;
    }
    if (index > 0) {
      const logical = typeof condition?.logical === "string" ? condition.logical.toUpperCase() : "AND";
      clauses.push(`${logical === "OR" ? "OR" : "AND"} ${clause}`);
    } else {
      clauses.push(clause);
    }
  });
  return clauses.join(" ");
}

function buildComposerGroupClause() {
  if (!Array.isArray(queryComposerState.groupBy) || !queryComposerState.groupBy.length) {
    return "";
  }
  return queryComposerState.groupBy
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function buildComposerOrderClause() {
  if (!Array.isArray(queryComposerState.orderBy) || !queryComposerState.orderBy.length) {
    return "";
  }
  const parts = queryComposerState.orderBy
    .map((order) => {
      const field = typeof order?.field === "string" ? order.field.trim() : "";
      if (!field) {
        return null;
      }
      const direction = (order?.direction || "ASC").toUpperCase();
      const nulls = (order?.nulls || "").toUpperCase();
      let clause = field;
      clause += direction === "DESC" ? " DESC" : " ASC";
      if (nulls === "FIRST" || nulls === "LAST") {
        clause += ` NULLS ${nulls}`;
      }
      return clause;
    })
    .filter(Boolean);
  return parts.join(", ");
}

function generateComposerChildQuery(child) {
  const relationship = typeof child?.relationship === "string" ? child.relationship.trim() : "";
  if (!relationship) {
    return "";
  }
  const fields = Array.isArray(child?.fields) && child.fields.length
    ? child.fields.map((field) => (typeof field === "string" ? field.trim() : "")).filter(Boolean)
    : [];
  const selectFields = fields.length ? fields.join(", ") : "Id";
  let clause = `(SELECT ${selectFields} FROM ${relationship}`;
  if (child?.where && child.where.trim()) {
    clause += ` WHERE ${child.where.trim()}`;
  }
  if (child?.orderBy && child.orderBy.trim()) {
    clause += ` ORDER BY ${child.orderBy.trim()}`;
  }
  if (child?.limit && String(child.limit).trim()) {
    clause += ` LIMIT ${String(child.limit).trim()}`;
  }
  if (child?.offset && String(child.offset).trim()) {
    clause += ` OFFSET ${String(child.offset).trim()}`;
  }
  clause += ")";
  return clause;
}

function buildQueryFromComposer(options = {}) {
  const { strict = false } = options;
  const errors = [];
  const objectName = queryComposerState.objectName?.trim();
  if (!objectName) {
    errors.push("toast.composer_missing_object");
  }
  const selectFields = Array.isArray(queryComposerState.fields) ? queryComposerState.fields.filter(Boolean) : [];
  const childSegments = Array.isArray(queryComposerState.childQueries)
    ? queryComposerState.childQueries
        .map((child) => generateComposerChildQuery(child))
        .filter(Boolean)
    : [];
  if (!selectFields.length && !childSegments.length) {
    errors.push("toast.composer_no_fields");
  }
  if (errors.length) {
    if (strict) {
      const message = translate(errors[0]);
      const error = new Error(message);
      error.translationKey = errors[0];
      throw error;
    }
    return { query: "", errors };
  }
  const selectKeyword = queryComposerState.distinct ? "SELECT DISTINCT" : "SELECT";
  const selectParts = [...selectFields, ...childSegments];
  let query = `${selectKeyword} ${selectParts.join(",\n  ")}\nFROM ${objectName}`;
  const whereClause = buildComposerWhereClause(queryComposerState.conditions);
  if (whereClause) {
    query += `\nWHERE ${whereClause}`;
  }
  const groupClause = buildComposerGroupClause();
  if (groupClause) {
    query += `\nGROUP BY ${groupClause}`;
  }
  const havingClause = buildComposerWhereClause(queryComposerState.having);
  if (havingClause) {
    query += `\nHAVING ${havingClause}`;
  }
  const orderClause = buildComposerOrderClause();
  if (orderClause) {
    query += `\nORDER BY ${orderClause}`;
  }
  if (queryComposerState.limit) {
    query += `\nLIMIT ${queryComposerState.limit}`;
  }
  if (queryComposerState.offset) {
    query += `\nOFFSET ${queryComposerState.offset}`;
  }
  if (queryComposerState.usingScope) {
    query += `\nUSING SCOPE ${queryComposerState.usingScope}`;
  }
  if (queryComposerState.securityEnforced) {
    query += `\nWITH SECURITY_ENFORCED`;
  }
  if (queryComposerState.forClause) {
    query += `\n${queryComposerState.forClause}`;
  }
  return { query, errors: [] };
}

function updateComposerPreview() {
  const preview = document.getElementById("query-composer-preview");
  const message = document.getElementById("query-composer-preview-message");
  if (!preview || !message) {
    return;
  }
  const result = buildQueryFromComposer();
  if (result.errors.length) {
    const key = result.errors[0];
    message.className = "alert alert-warning";
    message.textContent = translate(key);
    preview.value = "";
    return;
  }
  if (result.query) {
    message.className = "alert alert-success";
    message.textContent = translate("index.query.composer.preview.ready");
    preview.value = result.query;
  } else {
    message.className = "alert alert-info";
    message.textContent = translate("index.query.composer.preview.empty");
    preview.value = "";
  }
}

function applyComposerPartial(partial) {
  if (!partial || typeof partial !== "object") {
    return;
  }
  if (typeof partial.queryType === "string") {
    queryComposerState.queryType = partial.queryType;
  }
  if (typeof partial.objectName === "string") {
    queryComposerState.objectName = partial.objectName;
  }
  if (Array.isArray(partial.fields)) {
    queryComposerState.fields = partial.fields.slice();
  }
  if (Array.isArray(partial.conditions)) {
    queryComposerState.conditions = partial.conditions.map((item) => ({
      field: typeof item?.field === "string" ? item.field : "",
      operator: typeof item?.operator === "string" ? item.operator : "=",
      value: typeof item?.value === "string" ? item.value : "",
      logical: typeof item?.logical === "string" ? item.logical : "AND",
    }));
  }
  if (!Array.isArray(queryComposerState.conditions) || !queryComposerState.conditions.length) {
    queryComposerState.conditions = [createEmptyComposerCondition()];
  }
  if (Array.isArray(partial.groupBy)) {
    queryComposerState.groupBy = partial.groupBy.slice();
  }
  if (Array.isArray(partial.having)) {
    queryComposerState.having = partial.having.map((item) => ({
      field: typeof item?.field === "string" ? item.field : "",
      operator: typeof item?.operator === "string" ? item.operator : "=",
      value: typeof item?.value === "string" ? item.value : "",
      logical: typeof item?.logical === "string" ? item.logical : "AND",
    }));
  }
  if (Array.isArray(partial.orderBy)) {
    queryComposerState.orderBy = partial.orderBy.map((item) => ({
      field: typeof item?.field === "string" ? item.field : "",
      direction: typeof item?.direction === "string" ? item.direction : "ASC",
      nulls: typeof item?.nulls === "string" ? item.nulls : "",
    }));
  }
  if (Array.isArray(partial.childQueries)) {
    queryComposerState.childQueries = partial.childQueries.map((item) => ({
      relationship: typeof item?.relationship === "string" ? item.relationship : "",
      fields: Array.isArray(item?.fields) ? item.fields.slice() : [],
      where: typeof item?.where === "string" ? item.where : "",
      orderBy: typeof item?.orderBy === "string" ? item.orderBy : "",
      limit: typeof item?.limit === "string" || typeof item?.limit === "number" ? String(item.limit) : "",
      offset: typeof item?.offset === "string" || typeof item?.offset === "number" ? String(item.offset) : "",
    }));
  }
  if (typeof partial.limit === "string" || typeof partial.limit === "number") {
    queryComposerState.limit = String(partial.limit);
  }
  if (typeof partial.offset === "string" || typeof partial.offset === "number") {
    queryComposerState.offset = String(partial.offset);
  }
  if (typeof partial.distinct === "boolean") {
    queryComposerState.distinct = partial.distinct;
  }
  if (typeof partial.securityEnforced === "boolean") {
    queryComposerState.securityEnforced = partial.securityEnforced;
  }
  if (typeof partial.usingScope === "string") {
    queryComposerState.usingScope = partial.usingScope;
  }
  if (typeof partial.forClause === "string") {
    queryComposerState.forClause = partial.forClause;
  }
}

function applyComposerTemplateById(templateId) {
  const template = QUERY_COMPOSER_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return;
  }
  const partial = template.apply({ ...queryComposerState });
  if (!partial || typeof partial !== "object") {
    return;
  }
  resetQueryComposerState({ keepObject: false, silent: true });
  applyComposerPartial(partial);
  queryComposerState.lastAppliedTemplate = template.id;
  if (queryComposerState.objectName) {
    setComposerObjectName(queryComposerState.objectName, { updateUI: false });
  }
  updateQueryComposerUI();
  showToast(translate("toast.composer_template_applied"));
}

async function copyQueryComposerPreview() {
  const preview = document.getElementById("query-composer-preview");
  if (!preview) {
    return;
  }
  const value = preview.value || "";
  if (!value.trim()) {
    showToast(translate("toast.composer_no_preview"), "warning");
    return;
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
    } else {
      preview.focus();
      preview.select();
      document.execCommand("copy");
      preview.setSelectionRange(value.length, value.length);
    }
    showToast(translate("toast.composer_copied"));
  } catch (error) {
    showToast(translate("toast.composer_copy_failed"), "danger");
  }
}

function applyComposerToEditor() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) {
    return;
  }
  try {
    const { query } = buildQueryFromComposer({ strict: true });
    textarea.value = query;
    applyKeywordFormatting(textarea, { preserveCursor: false });
    textarea.focus();
    refreshQueryEditorState();
    saveQueryDraftToStorage(textarea.value);
    showToast(translate("toast.composer_inserted"));
    const modal = getQueryComposerModal();
    modal?.hide();
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.composer_no_fields");
    showToast(message, "warning");
  }
}

function syncQueryComposerFromEditor() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const query = textarea.value || "";
  resetQueryComposerState({ keepObject: false, silent: true });
  if (!query.trim()) {
    if (state.metadata.selectedObject) {
      setComposerObjectName(state.metadata.selectedObject, { updateUI: false });
    }
    updateQueryComposerUI();
    return;
  }
  const objectName = extractObjectNameFromQuery(query);
  if (objectName) {
    setComposerObjectName(objectName, { updateUI: false });
  }
  const fields = getSelectFields(query);
  if (fields.length) {
    queryComposerState.fields = fields;
  }
  queryComposerState.distinct = /\bSELECT\s+DISTINCT\b/i.test(query);
  queryComposerState.securityEnforced = /\bWITH\s+SECURITY_ENFORCED\b/i.test(query);
  const scopeMatch = query.match(/\bUSING\s+SCOPE\s+([A-Za-z0-9_]+)/i);
  queryComposerState.usingScope = scopeMatch ? scopeMatch[1] : "";
  const forMatch = query.match(/\bFOR\s+(VIEW|UPDATE)\b/i);
  queryComposerState.forClause = forMatch ? `FOR ${forMatch[1].toUpperCase()}` : "";
  const limitMatch = query.match(/\bLIMIT\s+(\d+)/i);
  queryComposerState.limit = limitMatch ? limitMatch[1] : "";
  const offsetMatch = query.match(/\bOFFSET\s+(\d+)/i);
  queryComposerState.offset = offsetMatch ? offsetMatch[1] : "";
  const whereMatch = query.match(/\bWHERE\s+([\s\S]*?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\bWITH\b|\bUSING\b|\bFOR\b|$)/i);
  if (whereMatch) {
    queryComposerState.conditions = [
      {
        field: "",
        operator: "",
        value: whereMatch[1].trim(),
        logical: "AND",
      },
    ];
  }
  const groupMatch = query.match(/\bGROUP\s+BY\s+([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\bWITH\b|\bUSING\b|\bFOR\b|$)/i);
  if (groupMatch) {
    queryComposerState.groupBy = groupMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (queryComposerState.groupBy.length) {
      queryComposerState.queryType = "aggregate";
    }
  }
  const havingMatch = query.match(/\bHAVING\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\bWITH\b|\bUSING\b|\bFOR\b|$)/i);
  if (havingMatch) {
    queryComposerState.having = [
      {
        field: "",
        operator: "",
        value: havingMatch[1].trim(),
        logical: "AND",
      },
    ];
  }
  const orderMatch = query.match(/\bORDER\s+BY\s+([\s\S]*?)(?=\bLIMIT\b|\bOFFSET\b|\bWITH\b|\bUSING\b|\bFOR\b|$)/i);
  if (orderMatch) {
    queryComposerState.orderBy = orderMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const tokens = item.split(/\s+/);
        const field = tokens.shift() || "";
        let direction = "ASC";
        let nulls = "";
        if (tokens.length) {
          const candidate = tokens[0].toUpperCase();
          if (candidate === "ASC" || candidate === "DESC") {
            direction = candidate;
            tokens.shift();
          }
        }
        const nullsIndex = tokens.findIndex((token) => token.toUpperCase() === "NULLS");
        if (nullsIndex !== -1 && tokens[nullsIndex + 1]) {
          const value = tokens[nullsIndex + 1].toUpperCase();
          if (value === "FIRST" || value === "LAST") {
            nulls = value;
          }
        }
        return { field, direction, nulls };
      });
  }
  const childMatches = query.match(/\((\s*SELECT[\s\S]+?)\)/gi);
  if (childMatches) {
    queryComposerState.childQueries = childMatches.map((segment) => {
      const relationshipMatch = segment.match(/FROM\s+([A-Za-z0-9_]+)/i);
      const fieldsMatch = segment.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
      const whereChildMatch = segment.match(/\bWHERE\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\))/i);
      const orderChildMatch = segment.match(/\bORDER\s+BY\s+([\s\S]*?)(?=\bLIMIT\b|\bOFFSET\b|\))/i);
      const limitChildMatch = segment.match(/\bLIMIT\s+(\d+)/i);
      const offsetChildMatch = segment.match(/\bOFFSET\s+(\d+)/i);
      return {
        relationship: relationshipMatch ? relationshipMatch[1] : "",
        fields: fieldsMatch
          ? fieldsMatch[1].split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        where: whereChildMatch ? whereChildMatch[1].trim() : "",
        orderBy: orderChildMatch ? orderChildMatch[1].trim() : "",
        limit: limitChildMatch ? limitChildMatch[1] : "",
        offset: offsetChildMatch ? offsetChildMatch[1] : "",
      };
    });
    if (queryComposerState.childQueries.length) {
      queryComposerState.queryType = "relationship";
    }
  }
  if (/\bTYPEOF\b/i.test(query)) {
    queryComposerState.queryType = "typeof";
  } else if (!queryComposerState.childQueries.length && /\bGROUP\s+BY\b/i.test(query)) {
    queryComposerState.queryType = "aggregate";
  } else if (!queryComposerState.childQueries.length) {
    queryComposerState.queryType = "basic";
  }
  updateQueryComposerUI();
}

function updateQueryComposerUI() {
  updateComposerObjectOptions();
  updateComposerFieldOptions();
  const typeSelect = document.getElementById("query-composer-type");
  if (typeSelect && typeSelect.value !== queryComposerState.queryType) {
    typeSelect.value = queryComposerState.queryType;
  }
  const objectInput = document.getElementById("query-composer-object");
  if (objectInput && document.activeElement !== objectInput) {
    objectInput.value = queryComposerState.objectName || "";
  }
  const distinctCheckbox = document.getElementById("query-composer-distinct");
  if (distinctCheckbox) {
    distinctCheckbox.checked = Boolean(queryComposerState.distinct);
  }
  const securityCheckbox = document.getElementById("query-composer-security");
  if (securityCheckbox) {
    securityCheckbox.checked = Boolean(queryComposerState.securityEnforced);
  }
  const scopeSelect = document.getElementById("query-composer-using-scope");
  if (scopeSelect && scopeSelect.value !== (queryComposerState.usingScope || "")) {
    scopeSelect.value = queryComposerState.usingScope || "";
  }
  const limitInput = document.getElementById("query-composer-limit");
  if (limitInput && document.activeElement !== limitInput) {
    limitInput.value = queryComposerState.limit || "";
  }
  const offsetInput = document.getElementById("query-composer-offset");
  if (offsetInput && document.activeElement !== offsetInput) {
    offsetInput.value = queryComposerState.offset || "";
  }
  const forSelect = document.getElementById("query-composer-for");
  if (forSelect && forSelect.value !== (queryComposerState.forClause || "")) {
    forSelect.value = queryComposerState.forClause || "";
  }
  renderQueryComposerFields();
  renderQueryComposerGroupFields();
  renderQueryComposerConditions();
  renderQueryComposerHaving();
  renderQueryComposerOrder();
  renderQueryComposerChildQueries();
  renderQueryComposerTemplates();
  updateComposerPreview();
}

function initializeQueryComposer() {
  const modalElement = document.getElementById("query-composer-modal");
  const openButton = document.getElementById("open-query-composer");
  if (!modalElement || !openButton) {
    return;
  }
  openButton.addEventListener("click", () => {
    syncQueryComposerFromEditor();
    const modal = getQueryComposerModal();
    modal?.show();
  });

  modalElement.addEventListener("shown.bs.modal", () => {
    updateQueryComposerUI();
    const objectInput = document.getElementById("query-composer-object");
    objectInput?.focus();
  });

  modalElement.addEventListener("hidden.bs.modal", () => {
    const fieldInput = document.getElementById("query-composer-field-input");
    if (fieldInput) {
      fieldInput.value = "";
    }
  });

  document.getElementById("query-composer-type")?.addEventListener("change", (event) => {
    queryComposerState.queryType = event.target.value;
    updateComposerPreview();
  });

  document.getElementById("query-composer-distinct")?.addEventListener("change", (event) => {
    queryComposerState.distinct = event.target.checked;
    updateComposerPreview();
  });

  document.getElementById("query-composer-object")?.addEventListener("change", (event) => {
    setComposerObjectName(event.target.value || "");
  });

  document.getElementById("query-composer-using-scope")?.addEventListener("change", (event) => {
    queryComposerState.usingScope = event.target.value || "";
    updateComposerPreview();
  });

  document.getElementById("query-composer-security")?.addEventListener("change", (event) => {
    queryComposerState.securityEnforced = event.target.checked;
    updateComposerPreview();
  });

  document.getElementById("query-composer-limit")?.addEventListener("input", (event) => {
    queryComposerState.limit = event.target.value;
    updateComposerPreview();
  });

  document.getElementById("query-composer-offset")?.addEventListener("input", (event) => {
    queryComposerState.offset = event.target.value;
    updateComposerPreview();
  });

  document.getElementById("query-composer-for")?.addEventListener("change", (event) => {
    queryComposerState.forClause = event.target.value || "";
    updateComposerPreview();
  });

  const fieldInput = document.getElementById("query-composer-field-input");
  document.getElementById("query-composer-add-field")?.addEventListener("click", () => {
    if (fieldInput) {
      addComposerField(fieldInput.value);
      fieldInput.value = "";
    }
  });
  fieldInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addComposerField(event.target.value);
      event.target.value = "";
    }
  });

  document.getElementById("query-composer-add-aggregate")?.addEventListener("click", () => {
    const funcSelect = document.getElementById("query-composer-aggregate-function");
    const aggregateField = document.getElementById("query-composer-aggregate-field");
    const aliasInput = document.getElementById("query-composer-aggregate-alias");
    addComposerAggregate(funcSelect?.value, aggregateField?.value, aliasInput?.value);
    if (aggregateField) aggregateField.value = "";
    if (aliasInput) aliasInput.value = "";
  });

  document.getElementById("query-composer-add-condition")?.addEventListener("click", () => addComposerCondition());
  document.getElementById("query-composer-add-having")?.addEventListener("click", () => addComposerHaving());
  document.getElementById("query-composer-add-order")?.addEventListener("click", () => addComposerOrder());
  document.getElementById("query-composer-add-child")?.addEventListener("click", () => addComposerChild());

  const groupInput = document.getElementById("query-composer-group-input");
  const applyGroup = () => {
    if (groupInput) {
      addComposerGroupField(groupInput.value);
      groupInput.value = "";
    }
  };
  document.getElementById("query-composer-group-apply")?.addEventListener("click", applyGroup);
  document.getElementById("query-composer-add-group-field")?.addEventListener("click", applyGroup);
  groupInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyGroup();
    }
  });

  modalElement.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.conditionGroup) {
      updateComposerCondition(target.dataset.conditionGroup, Number(target.dataset.conditionIndex), target.dataset.conditionField, target.value);
    } else if (target.dataset.orderIndex !== undefined) {
      updateComposerOrder(Number(target.dataset.orderIndex), target.dataset.orderField, target.value);
    } else if (target.dataset.childField && target.dataset.childField !== "field-input") {
      updateComposerChild(Number(target.dataset.childIndex), target.dataset.childField, target.value);
    }
  });

  modalElement.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.conditionGroup) {
      updateComposerCondition(target.dataset.conditionGroup, Number(target.dataset.conditionIndex), target.dataset.conditionField, target.value);
    } else if (target.dataset.orderIndex !== undefined) {
      updateComposerOrder(Number(target.dataset.orderIndex), target.dataset.orderField, target.value);
    }
  });

  modalElement.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-composer-action]");
    if (!actionElement) {
      return;
    }
    const action = actionElement.dataset.composerAction;
    if (action === "remove-field") {
      removeComposerField(Number(actionElement.dataset.index));
    } else if (action === "remove-group-field") {
      removeComposerGroupField(Number(actionElement.dataset.index));
    } else if (action === "remove-condition") {
      removeComposerCondition(Number(actionElement.dataset.index));
    } else if (action === "remove-having") {
      removeComposerHaving(Number(actionElement.dataset.index));
    } else if (action === "remove-order") {
      removeComposerOrder(Number(actionElement.dataset.index));
    } else if (action === "remove-child") {
      removeComposerChild(Number(actionElement.dataset.index));
    } else if (action === "child-add-field") {
      const index = Number(actionElement.dataset.index);
      const input = document.getElementById(`query-composer-child-field-input-${index}`);
      addComposerChildField(index, input?.value || "");
      if (input) {
        input.value = "";
      }
    } else if (action === "remove-child-field") {
      removeComposerChildField(Number(actionElement.dataset.childIndex), Number(actionElement.dataset.fieldIndex));
    } else if (action === "apply-template") {
      applyComposerTemplateById(actionElement.dataset.template);
    }
  });

  document.getElementById("query-composer-copy")?.addEventListener("click", () => {
    copyQueryComposerPreview();
  });

  document.getElementById("query-composer-reset")?.addEventListener("click", () => {
    resetQueryComposerState({ keepObject: Boolean(queryComposerState.objectName) });
    showToast(translate("toast.composer_reset"), "info");
  });

  document.getElementById("query-composer-apply")?.addEventListener("click", () => {
    applyComposerToEditor();
  });
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
