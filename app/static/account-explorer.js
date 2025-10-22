(function () {
  const DEFAULT_VIEW_MODE = "list";
  const VIEW_MODES = new Set(["list", "tree"]);

  const CONTACT_LINK_FIELDS = ["ContactId", "Contact__c", "Contact", "ParentId"];
  const INDIVIDUAL_LINK_FIELDS = ["IndividualId", "Individual__c"];

  function translateKey(key, params = {}) {
    if (typeof translate === "function") {
      const normalizedKey =
        typeof key === "string" && key.startsWith("frontend.")
          ? key.slice("frontend.".length)
          : key;
      const translated = translate(normalizedKey, params);
      if (translated !== normalizedKey) {
        return translated;
      }
      if (normalizedKey !== key) {
        return key;
      }
    }
    return key;
  }

  function formatValue(value) {
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

  function formatTimestampValue(isoString) {
    if (!isoString) {
      return "";
    }
    if (typeof formatTimestamp === "function") {
      return formatTimestamp(isoString);
    }
    return isoString;
  }

  function normalizeObjectDefinitions(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const seen = new Set();
    const normalized = [];
    raw.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      const key = typeof item.key === "string" ? item.key : null;
      if (!key || seen.has(key)) {
        return;
      }
      const label = typeof item.label === "string" && item.label ? item.label : key;
      normalized.push({ key, label, hidden: Boolean(item.hidden) });
      seen.add(key);
    });
    return normalized;
  }

  function getFieldValue(fields, name) {
    if (!Array.isArray(fields) || !name) {
      return null;
    }
    const field = fields.find((item) => item && item.name === name);
    return field ? field.value ?? null : null;
  }

  function findFirstFieldValue(record, candidates) {
    if (!record || !Array.isArray(candidates)) {
      return null;
    }
    for (const candidate of candidates) {
      const value = getFieldValue(record.fields || [], candidate);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return null;
  }

  const ALERT_DEFAULT_OBJECT = "Account";
  const alertFunctionCache = new Map();

  function generateAlertId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `alert-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isKnownObjectKey(objectKey) {
    if (!objectKey) {
      return false;
    }
    if (objectKey === ALERT_DEFAULT_OBJECT) {
      return true;
    }
    return objectDefinitions.some((definition) => definition.key === objectKey);
  }

  function normalizeAlertEntry(alert) {
    if (!alert || typeof alert !== "object") {
      return null;
    }
    const expression = typeof alert.expression === "string" ? alert.expression.trim() : "";
    if (!expression) {
      return null;
    }
    const id =
      typeof alert.id === "string" && alert.id.trim() ? alert.id.trim() : generateAlertId();
    const rawObject = typeof alert.object === "string" && alert.object.trim()
      ? alert.object.trim()
      : ALERT_DEFAULT_OBJECT;
    const object = isKnownObjectKey(rawObject) ? rawObject : ALERT_DEFAULT_OBJECT;
    const label = typeof alert.label === "string" ? alert.label.trim() : "";
    const message = typeof alert.message === "string" ? alert.message.trim() : "";
    const enabled = alert.enabled !== false;
    return { id, object, expression, label, message, enabled };
  }

  function normalizeAlertsList(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const seen = new Set();
    const alerts = [];
    raw.forEach((entry) => {
      const normalized = normalizeAlertEntry(entry);
      if (!normalized || seen.has(normalized.id)) {
        return;
      }
      const objectLabel =
        normalized.object === ALERT_DEFAULT_OBJECT
          ? translateKey("account_explorer.results.account_label")
          : getObjectLabel(normalized.object);
      if (!normalized.label) {
        normalized.label =
          objectLabel && objectLabel !== "account_explorer.results.account_label"
            ? objectLabel
            : normalized.object;
      }
      if (!normalized.message) {
        normalized.message = normalized.label;
      }
      alerts.push(normalized);
      seen.add(normalized.id);
    });
    return alerts;
  }

  function resetAlertCache() {
    alertFunctionCache.clear();
  }

  const ALERT_HELPERS = {
    field(record, name) {
      if (!record || !name) {
        return undefined;
      }
      if (Object.prototype.hasOwnProperty.call(record, name)) {
        return record[name];
      }
      const lower = String(name).toLowerCase();
      if (record.__lowerFieldMap && lower in record.__lowerFieldMap) {
        return record.__lowerFieldMap[lower];
      }
      return undefined;
    },
    fields(record) {
      if (!record || !record.__fieldMap) {
        return {};
      }
      return { ...record.__fieldMap };
    },
    isBlank(value) {
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === "string") {
        return value.trim() === "";
      }
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return false;
    },
    hasValue(value) {
      return !ALERT_HELPERS.isBlank(value);
    },
    normalize(value) {
      if (value === null || value === undefined) {
        return "";
      }
      return String(value).trim().toLowerCase();
    },
    equalsIgnoreCase(a, b) {
      return ALERT_HELPERS.normalize(a) === ALERT_HELPERS.normalize(b);
    },
    count(collection, predicate) {
      if (!Array.isArray(collection)) {
        return 0;
      }
      const fn = typeof predicate === "function" ? predicate : (item) => Boolean(item);
      return collection.reduce(
        (total, item, index) => total + (fn(item, index, collection) ? 1 : 0),
        0
      );
    },
    some(collection, predicate) {
      if (!Array.isArray(collection)) {
        return false;
      }
      const fn = typeof predicate === "function" ? predicate : (item) => Boolean(item);
      return collection.some((item, index) => fn(item, index, collection));
    },
    every(collection, predicate) {
      if (!Array.isArray(collection)) {
        return false;
      }
      const fn = typeof predicate === "function" ? predicate : (item) => Boolean(item);
      return collection.every((item, index) => fn(item, index, collection));
    },
    groupBy(collection, selector, { ignoreCase = false } = {}) {
      const map = new Map();
      if (!Array.isArray(collection) || typeof selector !== "function") {
        return map;
      }
      collection.forEach((item, index) => {
        const key = selector(item, index, collection);
        if (key === undefined || key === null) {
          return;
        }
        let normalizedKey = key;
        if (ignoreCase && typeof key === "string") {
          normalizedKey = key.toLowerCase();
        }
        if (!map.has(normalizedKey)) {
          map.set(normalizedKey, []);
        }
        map.get(normalizedKey).push(item);
      });
      return map;
    },
  };

  function buildFieldMap(fields) {
    const map = {};
    if (!Array.isArray(fields)) {
      return map;
    }
    fields.forEach((field) => {
      if (!field || typeof field.name !== "string") {
        return;
      }
      map[field.name] = field.value ?? null;
    });
    return map;
  }

  function createRecordWrapper(raw, objectKey, index = 0) {
    const fields = Array.isArray(raw?.fields) ? raw.fields : [];
    const fieldMap = buildFieldMap(fields);
    const context = { ...fieldMap };
    const fieldId = fieldMap.Id ?? null;
    const rawId = raw && typeof raw.id !== "undefined" && raw.id !== null ? raw.id : null;
    const idValue = rawId ?? fieldId;
    const recordKey = idValue ? String(idValue) : `${objectKey}-${index}`;
    if (!Object.prototype.hasOwnProperty.call(context, "Id")) {
      context.Id = idValue ?? null;
    }
    context.__id = idValue !== null && idValue !== undefined ? String(idValue) : null;
    context.__recordKey = recordKey;
    context.__objectKey = objectKey;
    context.__index = index;
    context.__fields = fields;
    context.__fieldMap = fieldMap;
    context.__lowerFieldMap = {};
    Object.keys(fieldMap).forEach((key) => {
      context.__lowerFieldMap[key.toLowerCase()] = fieldMap[key];
    });
    context.__raw = raw;
    if (raw && typeof raw === "object") {
      raw.__recordKey = recordKey;
    }
    return context;
  }

  function createAlertMessage(alert) {
    const label = (alert.label || "").trim() || alert.object;
    const message = (alert.message || "").trim() || label;
    return { id: alert.id, label, message };
  }

  function addRecordAlertMatch(matches, objectKey, recordKey, alert) {
    if (!recordKey) {
      return;
    }
    if (!matches.records[objectKey]) {
      matches.records[objectKey] = {};
    }
    if (!matches.records[objectKey][recordKey]) {
      matches.records[objectKey][recordKey] = [];
    }
    const message = createAlertMessage(alert);
    if (!matches.records[objectKey][recordKey].some((item) => item.id === message.id)) {
      matches.records[objectKey][recordKey].push(message);
    }
  }

  function addAccountAlertMatch(matches, alert) {
    const message = createAlertMessage(alert);
    if (!matches.account.some((item) => item.id === message.id)) {
      matches.account.push(message);
    }
  }

  function getAlertEvaluator(alert) {
    const cacheKey = `${alert.id}:${alert.expression}`;
    if (alertFunctionCache.has(cacheKey)) {
      return alertFunctionCache.get(cacheKey);
    }
    try {
      const fn = new Function(
        "account",
        "record",
        "objects",
        "objectKey",
        "helpers",
        `"use strict"; return (${alert.expression});`
      );
      const entry = { fn };
      alertFunctionCache.set(cacheKey, entry);
      return entry;
    } catch (error) {
      console.warn("Unable to compile account explorer alert", error);
      const entry = { fn: null };
      alertFunctionCache.set(cacheKey, entry);
      return entry;
    }
  }

  function evaluateAccountAlerts(account) {
    const matches = { account: [], records: {} };
    if (!account || !Array.isArray(configState.alerts) || !configState.alerts.length) {
      account.__alertMatches = matches;
      return matches;
    }
    const related = account.related || {};
    const accountContext = createRecordWrapper(account, ALERT_DEFAULT_OBJECT, 0);
    const objects = { [ALERT_DEFAULT_OBJECT]: [accountContext] };
    const objectKeys = new Set([ALERT_DEFAULT_OBJECT]);
    Object.entries(related).forEach(([key, records]) => {
      const list = Array.isArray(records) ? records : [];
      objects[key] = list.map((record, index) => createRecordWrapper(record, key, index));
      objectKeys.add(key);
    });
    objectDefinitions.forEach((definition) => {
      if (!objectKeys.has(definition.key)) {
        objects[definition.key] = [];
        objectKeys.add(definition.key);
      }
    });
    configState.alerts.forEach((alert) => {
      if (!alert || !alert.expression || alert.enabled === false) {
        return;
      }
      const targetObject = objectKeys.has(alert.object)
        ? alert.object
        : ALERT_DEFAULT_OBJECT;
      const evaluator = getAlertEvaluator(alert);
      if (!evaluator || typeof evaluator.fn !== "function") {
        return;
      }
      const records = objects[targetObject] || [];
      const candidates = records.length
        ? records
        : targetObject === ALERT_DEFAULT_OBJECT
        ? [accountContext]
        : [];
      let triggered = false;
      candidates.forEach((recordContext) => {
        try {
          const result = evaluator.fn(accountContext, recordContext, objects, targetObject, ALERT_HELPERS);
          if (result) {
            triggered = true;
            addRecordAlertMatch(matches, targetObject, recordContext.__recordKey, alert);
          }
        } catch (error) {
          console.warn("Account explorer alert evaluation failed", error);
        }
      });
      if (triggered) {
        addAccountAlertMatch(matches, alert);
      }
    });
    account.__alertMatches = matches;
    return matches;
  }

  function getAccountAlertMatches(account) {
    if (!account || !account.__alertMatches) {
      return { account: [], records: {} };
    }
    return account.__alertMatches;
  }

  function getAlertsForRecord(alertMatches, objectKey, record) {
    if (!alertMatches || !record) {
      return [];
    }
    const recordKey = record.__recordKey || (record.id ? String(record.id) : null);
    if (!recordKey) {
      return [];
    }
    const objectMatches = alertMatches.records?.[objectKey];
    if (!objectMatches) {
      return [];
    }
    return objectMatches[recordKey] || [];
  }

  function formatAlertMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) {
      return "";
    }
    return messages
      .map((item) => {
        if (!item) {
          return "";
        }
        if (item.message && item.message.trim()) {
          return item.message.trim();
        }
        if (item.label && item.label.trim()) {
          return item.label.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function insertTextAtCursor(element, text) {
    if (
      !element ||
      (element.tagName !== "TEXTAREA" && !(element instanceof HTMLInputElement)) ||
      typeof text !== "string"
    ) {
      return;
    }
    const value = element.value || "";
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    element.value = `${before}${text}${after}`;
    const position = before.length + text.length;
    if (typeof element.setSelectionRange === "function") {
      element.setSelectionRange(position, position);
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  let objectDefinitions = normalizeObjectDefinitions(window.ACCOUNT_EXPLORER_OBJECTS);

  function getRecordId(record) {
    if (!record) {
      return null;
    }
    if (record.id) {
      return String(record.id);
    }
    const value = getFieldValue(record.fields || [], "Id");
    return value ? String(value) : null;
  }

  function getRecordDisplayName(record, objectKey) {
    if (!record) {
      return "";
    }
    const fields = record.fields || [];
    if (objectKey === "Contact") {
      const first = getFieldValue(fields, "FirstName");
      const last = getFieldValue(fields, "LastName");
      const fullName = [first, last].filter(Boolean).join(" ").trim();
      if (fullName) {
        return fullName;
      }
    }
    if (objectKey === "Individual") {
      const first = getFieldValue(fields, "FirstName");
      const last = getFieldValue(fields, "LastName");
      const fullName = [first, last].filter(Boolean).join(" ").trim();
      if (fullName) {
        return fullName;
      }
    }
    const nameField = getFieldValue(fields, "Name");
    if (nameField) {
      return String(nameField);
    }
    const recordId = getRecordId(record);
    if (recordId) {
      return recordId;
    }
    return translateKey("account_explorer.results.no_id");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("account-explorer-file");
    const textInput = document.getElementById("account-explorer-text");
    const parseButton = document.getElementById("account-explorer-parse");
    const clearButton = document.getElementById("account-explorer-clear");
    const previewList = document.getElementById("account-explorer-preview-list");
    const previewEmpty = document.getElementById("account-explorer-preview-empty");
    const orgSelect = document.getElementById("account-explorer-org");
    const runButton = document.getElementById("account-explorer-run");
    const downloadButton = document.getElementById("account-explorer-download");
    const statusEl = document.getElementById("account-explorer-status");
    const missingEl = document.getElementById("account-explorer-missing");
    const resultsPlaceholder = document.getElementById("account-explorer-results-placeholder");
    const resultsContainer = document.getElementById("account-explorer-results");
    const accountList = document.getElementById("account-explorer-account-list");
    const listViewContainer = document.getElementById("account-explorer-list-view");
    const accountDetails = document.getElementById("account-explorer-account-details");
    const accountHeading = document.getElementById("account-explorer-account-heading");
    const accountFields = document.getElementById("account-explorer-account-fields");
    const accountRelated = document.getElementById("account-explorer-related");
    const accountEmpty = document.getElementById("account-explorer-account-empty");
    const treeViewContainer = document.getElementById("account-explorer-tree-view");
    const treeToolbar = document.getElementById("account-explorer-tree-toolbar");
    const treeContent = document.getElementById("account-explorer-tree-content");
    const treeEmpty = document.getElementById("account-explorer-tree-empty");
    const openTreeTabButton = document.getElementById("account-explorer-open-tree");
    const recordCountBadge = document.getElementById("account-explorer-record-count");
    const viewListButton = document.getElementById("account-explorer-view-list");
    const viewTreeButton = document.getElementById("account-explorer-view-tree");

    const setupModalEl = document.getElementById("accountExplorerSetupModal");
    const setupButton = document.getElementById("account-explorer-setup-button");
    const setupSaveButton = document.getElementById("account-explorer-setup-save");
    const setupStatus = document.getElementById("account-explorer-setup-status");
    const setupObjectList = document.getElementById("account-explorer-setup-object-list");
    const setupFieldsContainer = document.getElementById("account-explorer-setup-fields");
    const setupOrgSelect = document.getElementById("account-explorer-setup-org");
    const setupViewInputs = Array.from(
      document.querySelectorAll('input[name="account-explorer-setup-view"]')
    );
    const setupAlertList = document.getElementById("account-explorer-alert-list");
    const setupAlertAddButton = document.getElementById("account-explorer-alert-add");

    if (!parseButton || !clearButton || !previewList || !orgSelect) {
      return;
    }

    let accountIds = [];
    let explorerResult = null;
    let selectedAccountId = null;
    let availableOrgs = [];
    let latestTreeAccount = null;
    let latestTreeContext = null;

    objectDefinitions = normalizeObjectDefinitions(window.ACCOUNT_EXPLORER_OBJECTS);
    let configState =
      typeof window.ACCOUNT_EXPLORER_CONFIG === "object" && window.ACCOUNT_EXPLORER_CONFIG
        ? { ...window.ACCOUNT_EXPLORER_CONFIG }
        : { fields: {}, objects: [], alerts: [], viewMode: DEFAULT_VIEW_MODE };
    configState.alerts = normalizeAlertsList(configState.alerts);
    resetAlertCache();
    if (!VIEW_MODES.has(configState.viewMode)) {
      configState.viewMode = DEFAULT_VIEW_MODE;
    }
    let currentViewMode = configState.viewMode || DEFAULT_VIEW_MODE;

    let setupObjectsState = [];
    let setupViewMode = currentViewMode;
    let setupAlertsState = [];
    const setupFieldInputs = new Map();
    const setupFieldDatalists = new Map();
    const setupAlertFieldDatalists = new Map();
    const fieldCache = new Map();

    function isObjectVisible(key) {
      const definition = objectDefinitions.find((item) => item.key === key);
      if (!definition) {
        return true;
      }
      return !definition.hidden;
    }

    function getObjectLabel(key) {
      const definition = objectDefinitions.find((item) => item.key === key);
      return definition ? definition.label : key;
    }

    function getVisibleObjects() {
      return objectDefinitions.filter((item) => !item.hidden);
    }

    function getAlertObjectOptions() {
      const options = [];
      const seen = new Set();
      const accountLabel = translateKey("account_explorer.results.account_label");
      const resolvedAccountLabel =
        accountLabel && accountLabel !== "account_explorer.results.account_label"
          ? accountLabel
          : getObjectLabel(ALERT_DEFAULT_OBJECT);
      options.push({
        key: ALERT_DEFAULT_OBJECT,
        label: resolvedAccountLabel || ALERT_DEFAULT_OBJECT,
      });
      seen.add(ALERT_DEFAULT_OBJECT);
      objectDefinitions.forEach((definition) => {
        if (!definition || !definition.key || seen.has(definition.key)) {
          return;
        }
        options.push({ key: definition.key, label: definition.label || definition.key });
        seen.add(definition.key);
      });
      return options;
    }

    function updateRunState() {
      const hasAccounts = accountIds.length > 0;
      if (runButton) {
        runButton.disabled = !hasAccounts || !orgSelect.value;
      }
      if (downloadButton) {
        const available = !!(explorerResult && explorerResult.downloadAvailable);
        downloadButton.disabled = !available;
      }
    }

    function renderPreview() {
      if (!previewList || !previewEmpty) {
        return;
      }
      previewList.innerHTML = "";
      if (!accountIds.length) {
        previewList.classList.add("d-none");
        previewEmpty.classList.remove("d-none");
        previewEmpty.textContent = translateKey("account_explorer.input.preview_empty");
        return;
      }
      const limited = accountIds.slice(0, 50);
      limited.forEach((id) => {
        const item = document.createElement("li");
        item.className = "list-group-item py-1 px-2";
        item.textContent = id;
        previewList.appendChild(item);
      });
      previewList.classList.remove("d-none");
      previewEmpty.classList.add("d-none");
      if (accountIds.length > limited.length) {
        const note = document.createElement("li");
        note.className = "list-group-item py-1 px-2 text-muted";
        note.textContent = translateKey("account_explorer.input.preview_more", {
          extra: accountIds.length - limited.length,
        });
        previewList.appendChild(note);
      }
    }

    function populateOrgOptions(selectEl, data, { placeholderKey, preserveValue } = {}) {
      if (!selectEl || !Array.isArray(data)) {
        return;
      }
      const currentValue = preserveValue ? selectEl.value : "";
      const placeholderText = translateKey(
        placeholderKey || "account_explorer.run.org_placeholder"
      );
      selectEl.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = placeholderText;
      selectEl.appendChild(placeholder);
      data.forEach((org) => {
        const option = document.createElement("option");
        option.value = org.id;
        option.textContent = org.label || org.id;
        selectEl.appendChild(option);
      });
      if (currentValue && selectEl.querySelector(`option[value="${currentValue}"]`)) {
        selectEl.value = currentValue;
      }
    }

    function fetchOrgs() {
      fetch("/api/orgs")
        .then((response) => response.json())
        .then((data) => {
          if (!Array.isArray(data)) {
            return;
          }
          availableOrgs = data;
          populateOrgOptions(orgSelect, data, {
            placeholderKey: "account_explorer.run.org_placeholder",
            preserveValue: true,
          });
          populateOrgOptions(setupOrgSelect, data, {
            placeholderKey: "account_explorer.setup.org_placeholder",
            preserveValue: true,
          });
          updateRunState();
        })
        .catch(() => {
          showToast(translateKey("frontend.account_explorer.orgs_failed"), "danger");
        });
    }

    function setStatus(message, type = "muted") {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message || "";
      statusEl.className = "mt-3 small";
      if (message) {
        statusEl.classList.add(`text-${type}`);
      } else {
        statusEl.classList.add("text-muted");
      }
    }

    function setSetupStatus(message, type = "muted") {
      if (!setupStatus) {
        return;
      }
      setupStatus.textContent = message || "";
      setupStatus.className = "me-auto small";
      if (message) {
        setupStatus.classList.add(`text-${type}`);
      } else {
        setupStatus.classList.add("text-muted");
      }
    }

    function renderMissingAccounts(missing) {
      if (!missingEl) {
        return;
      }
      if (!Array.isArray(missing) || !missing.length) {
        missingEl.hidden = true;
        missingEl.innerHTML = "";
        return;
      }
      missingEl.hidden = false;
      missingEl.className = "alert alert-warning small";
      missingEl.textContent = translateKey("account_explorer.results.missing_accounts", {
        count: missing.length,
        ids: missing.join(", "),
      });
    }

    function getAccountDisplayName(account) {
      if (!account || !Array.isArray(account.fields)) {
        return "";
      }
      const nameField = account.fields.find((field) => field.name === "Name");
      if (nameField && nameField.value) {
        return String(nameField.value);
      }
      return account.id || "";
    }

    function renderFieldList(container, fields) {
      container.innerHTML = "";
      const visibleFields = Array.isArray(fields)
        ? fields.filter((field) => field && !field.hidden)
        : [];
      if (!visibleFields.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.results.no_fields");
        container.appendChild(empty);
        return;
      }
      visibleFields.forEach((field) => {
        const dt = document.createElement("dt");
        dt.className = "col-sm-4 col-lg-3 mb-1";
        dt.textContent = field.name;
        const dd = document.createElement("dd");
        dd.className = "col-sm-8 col-lg-9 mb-1";
        dd.textContent = formatValue(field.value);
        container.appendChild(dt);
        container.appendChild(dd);
      });
    }

    function renderTreeFieldList(container, fields) {
      container.innerHTML = "";
      const visibleFields = Array.isArray(fields)
        ? fields.filter((field) => field && !field.hidden)
        : [];
      if (!visibleFields.length) {
        const empty = document.createElement("div");
        empty.className = "account-tree-node__empty text-muted";
        empty.textContent = translateKey("account_explorer.results.no_fields");
        container.appendChild(empty);
        return;
      }
      visibleFields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "account-tree-node__field";
        const nameEl = document.createElement("div");
        nameEl.className = "account-tree-node__field-name";
        nameEl.textContent = field.name;
        const valueEl = document.createElement("div");
        valueEl.className = "account-tree-node__field-value";
        valueEl.textContent = formatValue(field.value);
        row.appendChild(nameEl);
        row.appendChild(valueEl);
        container.appendChild(row);
      });
    }

    function getAccountById(accountId) {
      if (
        !explorerResult ||
        !explorerResult.data ||
        !Array.isArray(explorerResult.data.accounts)
      ) {
        return null;
      }
      return explorerResult.data.accounts.find((item) => item.id === accountId) || null;
    }

    function renderRelatedSection(container, related, account) {
      container.innerHTML = "";
      const visibleObjects = getVisibleObjects();
      if (!visibleObjects.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.results.no_objects");
        container.appendChild(empty);
        return;
      }
      const alertMatches = account ? getAccountAlertMatches(account) : { account: [], records: {} };
      visibleObjects.forEach((definition) => {
        const key = definition.key;
        const records = Array.isArray(related[key]) ? related[key] : [];
        const section = document.createElement("div");
        section.className = "mb-4";
        const heading = document.createElement("h6");
        heading.className = "text-muted text-uppercase small mb-2";
        heading.textContent = `${definition.label} (${records.length})`;
        section.appendChild(heading);
        if (!records.length) {
          const empty = document.createElement("div");
          empty.className = "text-muted small";
          empty.textContent = translateKey("account_explorer.results.empty_object");
          section.appendChild(empty);
        } else {
          records.forEach((record) => {
            if (!record) {
              return;
            }
            const card = document.createElement("div");
            card.className = "border rounded p-2 mb-2";
            const recordAlerts = getAlertsForRecord(alertMatches, key, record);
            if (recordAlerts.length) {
              card.classList.add("account-alert");
              const tooltip = formatAlertMessages(recordAlerts);
              if (tooltip) {
                card.title = tooltip;
              }
            }
            const badge = document.createElement("div");
            badge.className = "badge bg-light text-secondary mb-2";
            badge.textContent = record.id || translateKey("account_explorer.results.no_id");
            card.appendChild(badge);
            const dl = document.createElement("dl");
            dl.className = "row mb-0 small";
            renderFieldList(dl, record.fields || []);
            card.appendChild(dl);
            section.appendChild(card);
          });
        }
        container.appendChild(section);
      });
    }

    function createRecordCard(record, objectKey) {
      const card = document.createElement("div");
      card.className = "border rounded p-2 mb-2";
      const header = document.createElement("div");
      header.className = "d-flex justify-content-between align-items-start mb-2";
      const title = document.createElement("div");
      title.className = "fw-semibold small";
      title.textContent = getRecordDisplayName(record, objectKey);
      header.appendChild(title);
      const recordId = getRecordId(record);
      if (recordId) {
        const badge = document.createElement("span");
        badge.className = "badge bg-light text-secondary";
        badge.textContent = recordId;
        header.appendChild(badge);
      }
      card.appendChild(header);
      const dl = document.createElement("dl");
      dl.className = "row mb-0 small";
      renderFieldList(dl, record.fields || []);
      card.appendChild(dl);
      return card;
    }

    function buildLinkMap(records, candidates) {
      const map = new Map();
      if (!Array.isArray(records)) {
        return map;
      }
      records.forEach((record) => {
        const value = findFirstFieldValue(record, candidates);
        if (!value) {
          return;
        }
        const key = String(value);
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(record);
      });
      return map;
    }

    function getTreeNodeTypeClass(objectKey) {
      switch (objectKey) {
        case "Account":
          return "account-tree-node--account";
        case "Contact":
          return "account-tree-node--contact";
        case "Individual":
          return "account-tree-node--individual";
        case "ContactPointPhone":
        case "ContactPointEmail":
          return "account-tree-node--contact-point";
        default:
          return "account-tree-node--object";
      }
    }

    function createTreeRecordNode(record, objectKey, { label, showFields = true, alerts = [] } = {}) {
      if (!record) {
        return null;
      }
      const node = document.createElement("div");
      const classes = ["account-tree-node", getTreeNodeTypeClass(objectKey)];
      node.className = classes.filter(Boolean).join(" ");
      if (objectKey) {
        node.dataset.objectKey = objectKey;
      }
      if (label) {
        const badge = document.createElement("div");
        badge.className = "account-tree-node__badge";
        badge.textContent = label;
        node.appendChild(badge);
      }
      if (Array.isArray(alerts) && alerts.length) {
        node.classList.add("account-alert");
        const tooltip = formatAlertMessages(alerts);
        if (tooltip) {
          node.title = tooltip;
        }
      }
      const title = document.createElement("div");
      title.className = "account-tree-node__title";
      title.textContent = getRecordDisplayName(record, objectKey);
      node.appendChild(title);
      const recordId = getRecordId(record);
      if (recordId) {
        const meta = document.createElement("div");
        meta.className = "account-tree-node__meta";
        meta.textContent = recordId;
        node.appendChild(meta);
      }
      if (showFields) {
        const fieldsContainer = document.createElement("div");
        fieldsContainer.className = "account-tree-node__fields";
        renderTreeFieldList(fieldsContainer, record.fields || []);
        node.appendChild(fieldsContainer);
      }
      return node;
    }

    function createTreeGroupNode(label, count, { objectKey, variant } = {}) {
      const node = document.createElement("div");
      const classes = ["account-tree-node", "account-tree-node--group"];
      if (variant) {
        classes.push(`account-tree-node--group-${variant}`);
      }
      node.className = classes.join(" ");
      if (objectKey) {
        node.dataset.objectKey = objectKey;
      }
      const title = document.createElement("div");
      title.className = "account-tree-node__title";
      title.textContent = `${label} (${count})`;
      node.appendChild(title);
      return node;
    }

    function createTreeEmptyNode(message) {
      const node = document.createElement("div");
      node.className = "account-tree-node account-tree-node--empty";
      const text = document.createElement("div");
      text.className = "account-tree-node__empty text-muted";
      text.textContent = message;
      node.appendChild(text);
      return node;
    }

    function buildTreeBranch(node, children = [], { isRoot = false } = {}) {
      if (!node) {
        return null;
      }
      const branch = document.createElement("div");
      branch.className = "account-tree-branch";
      if (isRoot) {
        branch.classList.add("account-tree-branch--root");
      }
      if (children.length) {
        branch.classList.add("account-tree-branch--has-children");
        node.classList.add("account-tree-node--collapsible");
        if (!node.hasAttribute("tabindex")) {
          node.setAttribute("tabindex", "0");
        }
      }
      branch.appendChild(node);
      if (children.length) {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "account-tree-children";
        children.forEach((child) => {
          if (child) {
            childrenContainer.appendChild(child);
          }
        });
        branch.appendChild(childrenContainer);
      }
      return branch;
    }

    function buildContactPointBranches(recordId, context, { forIndividual = false } = {}) {
      if (!recordId) {
        return [];
      }
      const mapping = forIndividual
        ? [
            { key: "ContactPointPhone", records: context.contactPointPhonesByIndividual },
            { key: "ContactPointEmail", records: context.contactPointEmailsByIndividual },
          ]
        : [
            { key: "ContactPointPhone", records: context.contactPointPhonesByContact },
            { key: "ContactPointEmail", records: context.contactPointEmailsByContact },
          ];
      const branches = [];
      mapping.forEach((entry) => {
        if (!context.isObjectVisible(entry.key)) {
          return;
        }
        const records = entry.records.get(recordId) || [];
        const groupNode = createTreeGroupNode(context.getLabel(entry.key), records.length, {
          objectKey: entry.key,
          variant: "contact-point",
        });
        const recordBranches = records
          .map((recordItem) => {
            if (!recordItem) {
              return null;
            }
            const recordNode = createTreeRecordNode(recordItem, entry.key, {
              label: context.getLabel(entry.key),
              alerts: context.getRecordAlerts(entry.key, recordItem),
            });
            return buildTreeBranch(recordNode);
          })
          .filter(Boolean);
        const childrenBranches = recordBranches.length
          ? recordBranches
          : [
              buildTreeBranch(
                createTreeEmptyNode(
                  translateKey("account_explorer.results.empty_object")
                )
              ),
            ];
        branches.push(buildTreeBranch(groupNode, childrenBranches));
      });
      return branches;
    }

    function buildContactChildrenBranches(record, context) {
      const contactId = getRecordId(record);
      if (!contactId) {
        return [];
      }
      const children = [];

      if (context.isObjectVisible("AccountContactRelation")) {
        const relations = context.contactRelationsByContact.get(contactId) || [];
        const groupNode = createTreeGroupNode(
          context.getLabel("AccountContactRelation"),
          relations.length,
          { objectKey: "AccountContactRelation", variant: "relation" }
        );
        const relationBranches = relations
          .map((relation) => {
            const relationNode = createTreeRecordNode(relation, "AccountContactRelation", {
              label: context.getLabel("AccountContactRelation"),
              alerts: context.getRecordAlerts("AccountContactRelation", relation),
            });
            return buildTreeBranch(relationNode);
          })
          .filter(Boolean);
        const childrenBranches = relationBranches.length
          ? relationBranches
          : [
              buildTreeBranch(
                createTreeEmptyNode(
                  translateKey("account_explorer.results.empty_object")
                )
              ),
            ];
        children.push(buildTreeBranch(groupNode, childrenBranches));
      }

      if (context.isObjectVisible("Individual")) {
        const individualId = findFirstFieldValue(record, INDIVIDUAL_LINK_FIELDS);
        if (individualId && context.individualsById.has(String(individualId))) {
          const individualRecord = context.individualsById.get(String(individualId));
          const individualNode = createTreeRecordNode(individualRecord, "Individual", {
            label: context.getLabel("Individual"),
            alerts: context.getRecordAlerts("Individual", individualRecord),
          });
          const contactPoints = buildContactPointBranches(
            getRecordId(individualRecord),
            context,
            { forIndividual: true }
          );
          children.push(buildTreeBranch(individualNode, contactPoints));
        }
      }

      children.push(...buildContactPointBranches(contactId, context, { forIndividual: false }));

      return children;
    }

    function buildRecordBranch(record, objectKey, context) {
      if (!record) {
        return null;
      }
      const recordNode = createTreeRecordNode(record, objectKey, {
        label: context.getLabel(objectKey),
        alerts: context.getRecordAlerts(objectKey, record),
      });
      let children = [];
      if (objectKey === "Contact") {
        children = buildContactChildrenBranches(record, context);
      }
      return buildTreeBranch(recordNode, children);
    }

    function buildObjectBranch(definition, related, context) {
      const key = definition.key;
      if (!context.isObjectVisible(key)) {
        return null;
      }
      const records = Array.isArray(related[key]) ? related[key] : [];
      const groupNode = createTreeGroupNode(definition.label, records.length, {
        objectKey: key,
        variant: key === "Contact" ? "contact" : undefined,
      });
      const recordBranches = records
        .map((recordItem) => buildRecordBranch(recordItem, key, context))
        .filter(Boolean);
      const childrenBranches = recordBranches.length
        ? recordBranches
        : [
            buildTreeBranch(
              createTreeEmptyNode(
                translateKey("account_explorer.results.empty_object")
              )
            ),
          ];
      return buildTreeBranch(groupNode, childrenBranches);
    }

    function createTreeHeader(account) {
      if (!account) {
        return null;
      }
      const header = document.createElement("div");
      header.className = "account-tree-header mb-3";
      const title = document.createElement("div");
      title.className = "account-tree-header__title";
      title.textContent = getAccountDisplayName(account) || account.id || "";
      header.appendChild(title);
      if (account.id) {
        const meta = document.createElement("div");
        meta.className = "account-tree-header__meta text-muted";
        meta.textContent = account.id;
        header.appendChild(meta);
      }
      return header;
    }

    function buildAccountTreeDiagram(account, context, { fullWidth = false } = {}) {
      const diagram = document.createElement("div");
      diagram.className = "account-tree-diagram";
      if (fullWidth) {
        diagram.classList.add("account-tree-diagram--full");
      }
      const accountRecordAlerts = context.getRecordAlerts("Account", account);
      const accountNode = createTreeRecordNode(account, "Account", {
        label: translateKey("account_explorer.results.account_label"),
        alerts: accountRecordAlerts.length
          ? accountRecordAlerts
          : context.alertMatches?.account || [],
      });
      const children = [];
      const related = account.related || {};
      const nestedKeys = new Set([
        "AccountContactRelation",
        "Individual",
        "ContactPointPhone",
        "ContactPointEmail",
      ]);
      context.visibleDefinitions.forEach((definition) => {
        if (nestedKeys.has(definition.key)) {
          return;
        }
        const branch = buildObjectBranch(definition, related, context);
        if (branch) {
          children.push(branch);
        }
      });
      if (!children.length) {
        const emptyNode = createTreeEmptyNode(
          translateKey("account_explorer.results.empty_object")
        );
        children.push(buildTreeBranch(emptyNode));
      }
      const rootBranch = buildTreeBranch(accountNode, children, { isRoot: true });
      if (rootBranch) {
        diagram.appendChild(rootBranch);
      }
      return diagram;
    }

    function renderTree(account) {
      if (!treeViewContainer || !treeContent || !treeEmpty) {
        return;
      }
      const isTreeMode = currentViewMode === "tree";
      treeViewContainer.classList.toggle("d-none", !isTreeMode);
      if (treeToolbar) {
        treeToolbar.classList.toggle("d-none", !isTreeMode || !account);
      }
      if (openTreeTabButton) {
        openTreeTabButton.disabled = !isTreeMode || !account;
      }
      if (!isTreeMode) {
        treeContent.classList.add("d-none");
        treeEmpty.classList.remove("d-none");
        treeEmpty.textContent = translateKey("account_explorer.results.select_account");
        latestTreeAccount = null;
        latestTreeContext = null;
        return;
      }
      if (!account) {
        treeContent.classList.add("d-none");
        treeEmpty.classList.remove("d-none");
        treeEmpty.textContent = translateKey("account_explorer.results.select_account");
        latestTreeAccount = null;
        latestTreeContext = null;
        return;
      }

      treeEmpty.classList.add("d-none");
      treeContent.classList.remove("d-none");
      treeContent.innerHTML = "";

      const related = account.related || {};
      const relations = Array.isArray(related.AccountContactRelation)
        ? related.AccountContactRelation
        : [];
      const individuals = Array.isArray(related.Individual) ? related.Individual : [];
      const phones = Array.isArray(related.ContactPointPhone) ? related.ContactPointPhone : [];
      const emails = Array.isArray(related.ContactPointEmail) ? related.ContactPointEmail : [];

      const individualsById = new Map();
      individuals.forEach((record) => {
        const id = getRecordId(record);
        if (id) {
          individualsById.set(id, record);
        }
      });

      const contactRelationsByContact = buildLinkMap(relations, CONTACT_LINK_FIELDS);
      const contactPointPhonesByContact = buildLinkMap(phones, CONTACT_LINK_FIELDS);
      const contactPointEmailsByContact = buildLinkMap(emails, CONTACT_LINK_FIELDS);
      const contactPointPhonesByIndividual = buildLinkMap(phones, INDIVIDUAL_LINK_FIELDS);
      const contactPointEmailsByIndividual = buildLinkMap(emails, INDIVIDUAL_LINK_FIELDS);

      const visibleDefinitions = getVisibleObjects().map((definition) => ({
        key: definition.key,
        label: definition.label,
      }));

      const alertMatches = getAccountAlertMatches(account);

      const context = {
        getLabel: getObjectLabel,
        isObjectVisible,
        individualsById,
        contactRelationsByContact,
        contactPointPhonesByContact,
        contactPointEmailsByContact,
        contactPointPhonesByIndividual,
        contactPointEmailsByIndividual,
        visibleDefinitions,
        alertMatches,
        getRecordAlerts(objectKey, record) {
          return getAlertsForRecord(alertMatches, objectKey, record);
        },
      };

      const header = createTreeHeader(account);
      if (header) {
        treeContent.appendChild(header);
      }

      const diagram = buildAccountTreeDiagram(account, context);
      treeContent.appendChild(diagram);
      treeContent.scrollLeft = 0;

      latestTreeAccount = account;
      latestTreeContext = context;
    }

    function toggleTreeBranch(branch, forceState) {
      if (!branch || !branch.classList.contains("account-tree-branch--has-children")) {
        return;
      }
      if (typeof forceState === "boolean") {
        branch.classList.toggle("account-tree-branch--collapsed", forceState);
        return;
      }
      branch.classList.toggle("account-tree-branch--collapsed");
    }

    function handleTreeNodeInteraction(event) {
      const node = event.target.closest(".account-tree-node--collapsible");
      if (!node) {
        return;
      }
      if (event.type === "keydown") {
        const key = event.key;
        if (key !== "Enter" && key !== " ") {
          return;
        }
        event.preventDefault();
      }
      const branch = node.closest(".account-tree-branch");
      toggleTreeBranch(branch);
    }

    function openTreeInNewTab() {
      if (!latestTreeAccount || !latestTreeContext) {
        return;
      }
      const treeWindow = window.open("", "_blank");
      if (!treeWindow) {
        return;
      }
      const account = latestTreeAccount;
      const context = latestTreeContext;
      const themeClass = document.body ? document.body.className : "";
      const container = document.createElement("div");
      container.className = "account-tree-full-container";
      const header = createTreeHeader(account);
      if (header) {
        container.appendChild(header);
      }
      const diagram = buildAccountTreeDiagram(account, context, { fullWidth: true });
      container.appendChild(diagram);

      const accountName = getAccountDisplayName(account) || account.id || "";
      const titleText = translateKey("account_explorer.results.tree_tab_title", {
        account: accountName,
      });
      const bootstrapLink = document.querySelector('link[href*="bootstrap"]');
      const bootstrapHref =
        (bootstrapLink && bootstrapLink.href) ||
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
      const bootstrapIntegrity = bootstrapLink ? bootstrapLink.integrity :
        "sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH";
      const bootstrapCrossorigin = bootstrapLink ? bootstrapLink.crossOrigin : "anonymous";
      const stylesLink = document.querySelector('link[href*="styles.css"]');
      const stylesHref = stylesLink ? stylesLink.href : `${window.location.origin}/static/styles.css`;
      const htmlContent = container.outerHTML;
      const language = document.documentElement.lang || "en";
      let bootstrapAttributes = "";
      if (bootstrapIntegrity) {
        const crossoriginAttr = bootstrapCrossorigin
          ? ` crossorigin="${bootstrapCrossorigin}"`
          : "";
        bootstrapAttributes = ` integrity="${bootstrapIntegrity}"${crossoriginAttr}`;
      } else if (bootstrapCrossorigin) {
        bootstrapAttributes = ` crossorigin="${bootstrapCrossorigin}"`;
      }
      treeWindow.document.open();
      treeWindow.document.write(`<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <title>${titleText}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${bootstrapHref}"${bootstrapAttributes} />
    <link rel="stylesheet" href="${stylesHref}" />
  </head>
  <body class="${themeClass} account-tree-full-page">
    <div class="account-tree-full-wrapper">
      ${htmlContent}
    </div>
    <script>
      (function () {
        function toggleBranch(branch, force) {
          if (!branch || !branch.classList.contains('account-tree-branch--has-children')) {
            return;
          }
          if (typeof force === 'boolean') {
            branch.classList.toggle('account-tree-branch--collapsed', force);
            return;
          }
          branch.classList.toggle('account-tree-branch--collapsed');
        }
        function onInteract(event) {
          const node = event.target.closest('.account-tree-node--collapsible');
          if (!node) {
            return;
          }
          if (event.type === 'keydown') {
            const key = event.key;
            if (key !== 'Enter' && key !== ' ') {
              return;
            }
            event.preventDefault();
          }
          const branch = node.closest('.account-tree-branch');
          toggleBranch(branch);
        }
        document.addEventListener('click', onInteract);
        document.addEventListener('keydown', onInteract);
      })();
    </script>
  </body>
</html>`);
      treeWindow.document.close();
    }

    function updateListView(account) {
      if (!accountDetails || !accountEmpty) {
        return;
      }
      if (!account) {
        accountDetails.classList.add("d-none");
        accountDetails.classList.remove("account-alert");
        accountDetails.removeAttribute("title");
        accountHeading.classList.remove("account-alert-heading");
        accountEmpty.classList.remove("d-none");
        return;
      }
      accountEmpty.classList.add("d-none");
      accountDetails.classList.remove("d-none");
      accountHeading.textContent = getAccountDisplayName(account) || account.id;
      const alertMatches = getAccountAlertMatches(account);
      const hasAccountAlerts = alertMatches.account.length > 0;
      accountDetails.classList.toggle("account-alert", hasAccountAlerts);
      if (hasAccountAlerts) {
        const tooltip = formatAlertMessages(alertMatches.account);
        if (tooltip) {
          accountDetails.title = tooltip;
        } else {
          accountDetails.removeAttribute("title");
        }
      } else {
        accountDetails.removeAttribute("title");
      }
      accountHeading.classList.toggle("account-alert-heading", hasAccountAlerts);
      renderFieldList(accountFields, account.fields || []);
      renderRelatedSection(accountRelated, account.related || {}, account);
    }

    function setActiveAccountInList(accountId) {
      Array.from(accountList.children).forEach((button) => {
        if (button.dataset.accountId === accountId) {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }
      });
    }

    function setViewMode(mode, { force = false } = {}) {
      const normalized = VIEW_MODES.has(mode) ? mode : DEFAULT_VIEW_MODE;
      const changed = normalized !== currentViewMode;
      currentViewMode = normalized;
      if (viewListButton) {
        viewListButton.classList.toggle("active", currentViewMode === "list");
      }
      if (viewTreeButton) {
        viewTreeButton.classList.toggle("active", currentViewMode === "tree");
      }
      if (listViewContainer) {
        listViewContainer.classList.toggle("d-none", currentViewMode !== "list");
      }
      const account = selectedAccountId ? getAccountById(selectedAccountId) : null;
      renderTree(account);
      if (changed && !force) {
        setupViewMode = currentViewMode;
      }
    }

    function renderAccount(accountId) {
      const account = getAccountById(accountId);
      selectedAccountId = account ? account.id : null;
      updateListView(account);
      renderTree(account);
      if (account && account.id) {
        setActiveAccountInList(account.id);
      } else {
        setActiveAccountInList("__none__");
      }
    }

    function renderResults(result) {
      explorerResult = result || null;
      if (result && result.data && Array.isArray(result.data.objects)) {
        objectDefinitions = normalizeObjectDefinitions(result.data.objects);
        window.ACCOUNT_EXPLORER_OBJECTS = objectDefinitions;
      }
      if (!result || !result.data || !Array.isArray(result.data.accounts) || !result.data.accounts.length) {
        resultsContainer.classList.add("d-none");
        resultsPlaceholder.classList.remove("d-none");
        recordCountBadge.hidden = true;
        renderMissingAccounts(result?.missingAccountIds || []);
        const warnings = result?.data?.warnings;
        if (warnings && typeof warnings === "object") {
          const warningMessages = Object.values(warnings)
            .filter((value) => typeof value === "string" && value.trim())
            .map((value) => value.trim());
          if (warningMessages.length) {
            setStatus(warningMessages.join(" • "), "warning");
          } else {
            setStatus("", "muted");
          }
        } else {
          setStatus("", "muted");
        }
        renderTree(null);
        return;
      }
      resultsPlaceholder.classList.add("d-none");
      resultsContainer.classList.remove("d-none");
      const accounts = result.data.accounts;
      accountList.innerHTML = "";
      accounts.forEach((account) => {
        const alertMatches = evaluateAccountAlerts(account);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "list-group-item list-group-item-action";
        button.dataset.accountId = account.id;
        const title = document.createElement("div");
        title.className = "fw-semibold";
        title.textContent = getAccountDisplayName(account);
        const subtitle = document.createElement("div");
        subtitle.className = "small text-muted";
        subtitle.textContent = account.id;
        button.appendChild(title);
        button.appendChild(subtitle);
        if (alertMatches.account.length) {
          button.classList.add("account-alert");
          const tooltip = formatAlertMessages(alertMatches.account);
          if (tooltip) {
            button.title = tooltip;
          }
        }
        button.addEventListener("click", () => {
          renderAccount(account.id);
        });
        accountList.appendChild(button);
      });
      if (!selectedAccountId || !accounts.some((item) => item.id === selectedAccountId)) {
        selectedAccountId = accounts[0]?.id || null;
      }
      if (selectedAccountId) {
        renderAccount(selectedAccountId);
      } else {
        renderTree(null);
      }
      if (recordCountBadge) {
        recordCountBadge.hidden = false;
        recordCountBadge.textContent = translateKey("account_explorer.results.accounts_badge", {
          count: accounts.length,
        });
      }
      renderMissingAccounts(result.missingAccountIds || []);
      const warnings = result.data?.warnings;
      const warningMessages = [];
      if (warnings && typeof warnings === "object") {
        Object.values(warnings).forEach((value) => {
          if (typeof value === "string" && value.trim()) {
            warningMessages.push(value.trim());
          }
        });
      }
      const statusMessages = [...warningMessages];
      let statusType = warningMessages.length ? "warning" : "muted";
      if (result.generatedAt) {
        statusMessages.push(
          translateKey("account_explorer.run.generated_at", {
            timestamp: formatTimestampValue(result.generatedAt),
          })
        );
      }
      if (statusMessages.length) {
        setStatus(statusMessages.join(" • "), statusType);
      } else {
        setStatus("", "muted");
      }
      updateRunState();
      setViewMode(currentViewMode, { force: true });
    }

    function handleParseResponse(data) {
      if (!data || !Array.isArray(data.ids)) {
        throw new Error("invalid_response");
      }
      accountIds = data.ids;
      if (!accountIds.length) {
        showToast(translateKey("frontend.account_explorer.parse_empty"), "warning");
      } else {
        showToast(
          translateKey("frontend.account_explorer.parse_success", { count: accountIds.length }),
          "success"
        );
      }
      renderPreview();
      updateRunState();
    }

    function parseAccounts() {
      const file = fileInput?.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        fetch("/api/account-explorer/parse", {
          method: "POST",
          body: formData,
        })
          .then((response) =>
            response
              .json()
              .then((data) => ({ ok: response.ok, data }))
          )
          .then(({ ok, data }) => {
            if (!ok) {
              const code = data?.code || "invalid_file";
              throw new Error(code);
            }
            handleParseResponse(data);
          })
          .catch((error) => {
            const code = error instanceof Error ? error.message : "parse_failed";
            showToast(
              translateKey(`frontend.account_explorer.errors.${code}`) ||
                translateKey("frontend.account_explorer.parse_failed"),
              "danger"
            );
          });
        return;
      }
      const text = textInput ? textInput.value : "";
      fetch("/api/account-explorer/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((response) =>
          response
            .json()
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            const code = data?.code || "parse_failed";
            throw new Error(code);
          }
          handleParseResponse(data);
        })
        .catch((error) => {
          const code = error instanceof Error ? error.message : "parse_failed";
          showToast(
            translateKey(`frontend.account_explorer.errors.${code}`) ||
              translateKey("frontend.account_explorer.parse_failed"),
            "danger"
          );
        });
    }

    function runExplorer() {
      if (!accountIds.length) {
        showToast(translateKey("frontend.account_explorer.no_accounts"), "warning");
        return;
      }
      if (!orgSelect.value) {
        showToast(translateKey("frontend.account_explorer.no_org"), "warning");
        return;
      }
      runButton.disabled = true;
      setStatus(translateKey("account_explorer.run.status_running"), "primary");
      fetch("/api/account-explorer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgSelect.value,
          account_ids: accountIds,
        }),
      })
        .then((response) =>
          response
            .json()
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            const code = typeof data?.code === "string" ? data.code : null;
            const serverMessage =
              !code && typeof data?.error === "string" ? data.error : null;
            if (serverMessage) {
              throw new Error(`server:${serverMessage}`);
            }
            throw new Error(code || "run_failed");
          }
          explorerResult = data;
          renderResults(explorerResult);
          showToast(translateKey("frontend.account_explorer.run_success"), "success");
        })
        .catch((error) => {
          if (error instanceof Error && error.message.startsWith("server:")) {
            const message = error.message.slice("server:".length).trim();
            const fallback = translateKey("frontend.account_explorer.run_failed");
            const displayMessage = message || fallback;
            showToast(displayMessage, "danger");
            setStatus(displayMessage, "danger");
            return;
          }
          const code = error instanceof Error ? error.message : "run_failed";
          const translationKeys = [
            `frontend.account_explorer.errors.${code}`,
            `frontend.account_explorer.${code}`,
          ];
          let message = "";
          translationKeys.some((key) => {
            const translated = translateKey(key);
            if (translated !== key) {
              message = translated;
              return true;
            }
            return false;
          });
          if (!message) {
            message = translateKey("frontend.account_explorer.run_failed");
          }
          showToast(message, "danger");
          setStatus(message, "danger");
        })
        .finally(() => {
          runButton.disabled = false;
          updateRunState();
        });
    }

    function clearInputs() {
      if (fileInput) {
        fileInput.value = "";
      }
      if (textInput) {
        textInput.value = "";
      }
      accountIds = [];
      renderPreview();
      updateRunState();
    }

    function gatherSetupFields() {
      const payload = {};
      setupFieldInputs.forEach((inputs, objectKey) => {
        const values = [];
        const seen = new Set();
        inputs.forEach((input) => {
          const value = (input.value || "").trim();
          if (!value) {
            return;
          }
          const normalized = value;
          if (normalized.toLowerCase() === "id" || seen.has(normalized)) {
            return;
          }
          seen.add(normalized);
          if (values.length < 5) {
            values.push(normalized);
          }
        });
        if (values.length) {
          payload[objectKey] = values;
        }
      });
      return payload;
    }

    function loadObjectFields(objectKey, { showWarning = true } = {}) {
      if (!setupOrgSelect || !setupOrgSelect.value) {
        if (showWarning) {
          showToast(translateKey("frontend.account_explorer.no_org"), "warning");
        }
        return Promise.reject(new Error("no_org"));
      }
      const cacheKey = `${setupOrgSelect.value}:${objectKey}`;
      if (fieldCache.has(cacheKey)) {
        return Promise.resolve(fieldCache.get(cacheKey));
      }
      return fetch(
        `/api/account-explorer/fields?org_id=${encodeURIComponent(
          setupOrgSelect.value
        )}&object=${encodeURIComponent(objectKey)}`
      )
        .then((response) =>
          response
            .json()
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            throw new Error("fields_failed");
          }
          const fields = Array.isArray(data?.fields) ? data.fields : [];
          fieldCache.set(cacheKey, fields);
          return fields;
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            throw error;
          }
          throw new Error("fields_failed");
        });
    }

    function ensureObjectFieldsLoaded(objectKey) {
      loadObjectFields(objectKey)
        .then((fields) => {
          fillDatalist(objectKey, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            return;
          }
          showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
        });
    }

    function fillDatalist(objectKey, fields) {
      const datalist = setupFieldDatalists.get(objectKey);
      if (!datalist) {
        return;
      }
      datalist.innerHTML = "";
      fields.forEach((field) => {
        const option = document.createElement("option");
        option.value = field.name || "";
        if (field.label) {
          option.label = `${field.label} (${field.name})`;
        }
        datalist.appendChild(option);
      });
    }

    function populateAlertFieldSuggestions(alertId) {
      if (!setupAlertFieldDatalists.has(alertId)) {
        return;
      }
      const datalist = setupAlertFieldDatalists.get(alertId);
      const alertEntry = setupAlertsState.find((item) => item.id === alertId);
      if (!datalist || !alertEntry) {
        return;
      }
      datalist.innerHTML = "";
      const seen = new Set();
      const appendFields = (fields, prefix = "") => {
        if (!Array.isArray(fields)) {
          return;
        }
        fields.forEach((field) => {
          if (!field || typeof field.name !== "string" || !field.name) {
            return;
          }
          const token = prefix ? `${prefix}${field.name}` : field.name;
          if (seen.has(token)) {
            return;
          }
          seen.add(token);
          const option = document.createElement("option");
          option.value = token;
          if (field.label) {
            option.label = `${field.label} (${token})`;
          }
          datalist.appendChild(option);
        });
      };
      const targetObject = isKnownObjectKey(alertEntry.object)
        ? alertEntry.object
        : ALERT_DEFAULT_OBJECT;
      loadObjectFields(targetObject, { showWarning: true })
        .then((fields) => {
          const prefix = targetObject === ALERT_DEFAULT_OBJECT ? "" : `${targetObject}.`;
          appendFields(fields, prefix);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            return;
          }
          showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
        });
      if (targetObject !== ALERT_DEFAULT_OBJECT) {
        loadObjectFields(ALERT_DEFAULT_OBJECT, { showWarning: false })
          .then((fields) => {
            appendFields(fields, "Account.");
          })
          .catch(() => {});
      }
    }

    function renderSetupAlerts() {
      if (!setupAlertList) {
        return;
      }
      setupAlertFieldDatalists.clear();
      setupAlertList.innerHTML = "";
      if (!setupAlertsState.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.setup.alerts_empty");
        setupAlertList.appendChild(empty);
        return;
      }
      const objectOptions = getAlertObjectOptions();
      setupAlertsState.forEach((alert) => {
        const container = document.createElement("div");
        container.className = "border rounded p-3";
        container.dataset.alertId = alert.id;

        const row = document.createElement("div");
        row.className = "row g-3";
        container.appendChild(row);

        const nameCol = document.createElement("div");
        nameCol.className = "col-lg-4";
        const nameLabel = document.createElement("label");
        nameLabel.className = "form-label";
        nameLabel.textContent = translateKey("account_explorer.setup.alerts_label");
        nameLabel.setAttribute("for", `account-explorer-alert-label-${alert.id}`);
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "form-control";
        nameInput.id = `account-explorer-alert-label-${alert.id}`;
        nameInput.value = alert.label || "";
        nameInput.placeholder = translateKey(
          "account_explorer.setup.alerts_label_placeholder"
        );
        nameInput.dataset.role = "alert-label";
        nameCol.appendChild(nameLabel);
        nameCol.appendChild(nameInput);
        row.appendChild(nameCol);

        const messageCol = document.createElement("div");
        messageCol.className = "col-lg-5";
        const messageLabel = document.createElement("label");
        messageLabel.className = "form-label";
        messageLabel.textContent = translateKey("account_explorer.setup.alerts_message_label");
        messageLabel.setAttribute("for", `account-explorer-alert-message-${alert.id}`);
        const messageInput = document.createElement("input");
        messageInput.type = "text";
        messageInput.className = "form-control";
        messageInput.id = `account-explorer-alert-message-${alert.id}`;
        messageInput.value = alert.message || "";
        messageInput.placeholder = translateKey(
          "account_explorer.setup.alerts_message_placeholder"
        );
        messageInput.dataset.role = "alert-message";
        messageCol.appendChild(messageLabel);
        messageCol.appendChild(messageInput);
        row.appendChild(messageCol);

        const objectCol = document.createElement("div");
        objectCol.className = "col-lg-3";
        const objectLabel = document.createElement("label");
        objectLabel.className = "form-label";
        objectLabel.textContent = translateKey("account_explorer.setup.alerts_object_label");
        objectLabel.setAttribute("for", `account-explorer-alert-object-${alert.id}`);
        const objectSelect = document.createElement("select");
        objectSelect.className = "form-select";
        objectSelect.id = `account-explorer-alert-object-${alert.id}`;
        objectSelect.dataset.role = "alert-object";
        objectOptions.forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option.key;
          opt.textContent = option.label;
          objectSelect.appendChild(opt);
        });
        objectSelect.value = isKnownObjectKey(alert.object)
          ? alert.object
          : ALERT_DEFAULT_OBJECT;
        objectCol.appendChild(objectLabel);
        objectCol.appendChild(objectSelect);
        row.appendChild(objectCol);

        const expressionCol = document.createElement("div");
        expressionCol.className = "col-12";
        const expressionLabel = document.createElement("label");
        expressionLabel.className = "form-label";
        expressionLabel.textContent = translateKey(
          "account_explorer.setup.alerts_expression_label"
        );
        expressionLabel.setAttribute("for", `account-explorer-alert-expression-${alert.id}`);
        const expressionInput = document.createElement("textarea");
        expressionInput.className = "form-control";
        expressionInput.id = `account-explorer-alert-expression-${alert.id}`;
        expressionInput.rows = 3;
        expressionInput.placeholder = translateKey(
          "account_explorer.setup.alerts_expression_placeholder"
        );
        expressionInput.value = alert.expression || "";
        expressionInput.dataset.role = "alert-expression";
        expressionCol.appendChild(expressionLabel);
        expressionCol.appendChild(expressionInput);
        row.appendChild(expressionCol);

        const helperRow = document.createElement("div");
        helperRow.className = "d-flex flex-wrap align-items-center gap-3 mt-3";

        const helperWrapper = document.createElement("div");
        helperWrapper.className = "flex-grow-1";
        const helperLabel = document.createElement("label");
        helperLabel.className = "form-label small mb-1";
        helperLabel.textContent = translateKey(
          "account_explorer.setup.alerts_field_helper_label"
        );
        helperLabel.setAttribute("for", `account-explorer-alert-field-${alert.id}`);
        const helperInput = document.createElement("input");
        helperInput.type = "text";
        helperInput.className = "form-control form-control-sm";
        helperInput.id = `account-explorer-alert-field-${alert.id}`;
        helperInput.setAttribute("list", `account-explorer-alert-datalist-${alert.id}`);
        helperInput.placeholder = translateKey(
          "account_explorer.setup.alerts_field_helper_placeholder"
        );
        helperInput.dataset.role = "alert-field-helper";
        helperInput.addEventListener("focus", () => populateAlertFieldSuggestions(alert.id));
        helperWrapper.appendChild(helperLabel);
        helperWrapper.appendChild(helperInput);
        helperRow.appendChild(helperWrapper);

        const controlsWrapper = document.createElement("div");
        controlsWrapper.className = "d-flex align-items-center gap-2 ms-auto";

        const toggleWrapper = document.createElement("div");
        toggleWrapper.className = "form-check form-switch";
        const toggleInput = document.createElement("input");
        toggleInput.type = "checkbox";
        toggleInput.className = "form-check-input";
        toggleInput.id = `account-explorer-alert-enabled-${alert.id}`;
        toggleInput.checked = alert.enabled !== false;
        toggleInput.dataset.role = "alert-enabled";
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "form-check-label";
        toggleLabel.setAttribute("for", toggleInput.id);
        toggleLabel.textContent = translateKey("account_explorer.setup.alerts_enabled_label");
        toggleWrapper.appendChild(toggleInput);
        toggleWrapper.appendChild(toggleLabel);
        controlsWrapper.appendChild(toggleWrapper);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.dataset.action = "remove-alert";
        removeButton.textContent = translateKey(
          "account_explorer.setup.alerts_remove_button"
        );
        controlsWrapper.appendChild(removeButton);

        helperRow.appendChild(controlsWrapper);
        container.appendChild(helperRow);

        const datalist = document.createElement("datalist");
        datalist.id = `account-explorer-alert-datalist-${alert.id}`;
        container.appendChild(datalist);
        setupAlertFieldDatalists.set(alert.id, datalist);

        setupAlertList.appendChild(container);
      });
    }

    function gatherSetupAlerts() {
      const alerts = [];
      setupAlertsState.forEach((alert) => {
        if (!alert || typeof alert !== "object") {
          return;
        }
        const expression = typeof alert.expression === "string" ? alert.expression.trim() : "";
        if (!expression) {
          return;
        }
        const objectKey = isKnownObjectKey(alert.object) ? alert.object : ALERT_DEFAULT_OBJECT;
        alerts.push({
          id: typeof alert.id === "string" && alert.id ? alert.id : generateAlertId(),
          label: typeof alert.label === "string" ? alert.label.trim() : "",
          message: typeof alert.message === "string" ? alert.message.trim() : "",
          object: objectKey,
          expression,
          enabled: alert.enabled !== false,
        });
      });
      return alerts;
    }

    function addAlertEntry() {
      const newAlert = {
        id: generateAlertId(),
        label: "",
        message: "",
        object: ALERT_DEFAULT_OBJECT,
        expression: "",
        enabled: true,
      };
      setupAlertsState.push(newAlert);
      renderSetupAlerts();
    }

    function handleAlertListInput(event) {
      const target = event.target;
      if (!target || !target.dataset) {
        return;
      }
      const container = target.closest("[data-alert-id]");
      if (!container) {
        return;
      }
      const alertId = container.dataset.alertId;
      const alertEntry = setupAlertsState.find((item) => item.id === alertId);
      if (!alertEntry) {
        return;
      }
      const role = target.dataset.role;
      if (role === "alert-label") {
        alertEntry.label = target.value;
      }
      if (role === "alert-message") {
        alertEntry.message = target.value;
      }
      if (role === "alert-expression") {
        alertEntry.expression = target.value;
      }
    }

    function handleAlertListChange(event) {
      const target = event.target;
      if (!target || !target.dataset) {
        return;
      }
      const container = target.closest("[data-alert-id]");
      if (!container) {
        return;
      }
      const alertId = container.dataset.alertId;
      const alertEntry = setupAlertsState.find((item) => item.id === alertId);
      if (!alertEntry) {
        return;
      }
      const role = target.dataset.role;
      if (role === "alert-object") {
        const value = target.value && isKnownObjectKey(target.value)
          ? target.value
          : ALERT_DEFAULT_OBJECT;
        alertEntry.object = value;
        populateAlertFieldSuggestions(alertId);
      }
      if (role === "alert-enabled") {
        alertEntry.enabled = target.checked;
      }
      if (role === "alert-field-helper") {
        const inserted = (target.value || "").trim();
        if (inserted) {
          const expressionInput = container.querySelector('[data-role="alert-expression"]');
          if (expressionInput) {
            insertTextAtCursor(expressionInput, inserted);
          }
        }
        target.value = "";
      }
    }

    function handleAlertListClick(event) {
      const button = event.target.closest('button[data-action="remove-alert"]');
      if (!button) {
        return;
      }
      const container = button.closest("[data-alert-id]");
      if (!container) {
        return;
      }
      const alertId = container.dataset.alertId;
      setupAlertsState = setupAlertsState.filter((item) => item.id !== alertId);
      renderSetupAlerts();
    }

    function renderSetupObjectList() {
      if (!setupObjectList) {
        return;
      }
      setupObjectList.innerHTML = "";
      if (!setupObjectsState.length) {
        const item = document.createElement("li");
        item.className = "list-group-item text-muted small";
        item.textContent = translateKey("account_explorer.setup.objects_empty");
        setupObjectList.appendChild(item);
        return;
      }
      setupObjectsState.forEach((definition, index) => {
        const item = document.createElement("li");
        item.className = "list-group-item d-flex align-items-center justify-content-between gap-3";
        item.dataset.object = definition.key;
        const info = document.createElement("div");
        const title = document.createElement("div");
        title.className = "fw-semibold";
        title.textContent = definition.label;
        const subtitle = document.createElement("div");
        subtitle.className = "text-muted small";
        subtitle.textContent = definition.key;
        info.appendChild(title);
        info.appendChild(subtitle);
        item.appendChild(info);

        const controls = document.createElement("div");
        controls.className = "d-flex align-items-center gap-2 flex-wrap";

        const group = document.createElement("div");
        group.className = "btn-group btn-group-sm";
        const upButton = document.createElement("button");
        upButton.type = "button";
        upButton.className = "btn btn-outline-secondary";
        upButton.dataset.action = "move-up";
        upButton.innerHTML = "<span aria-hidden=\"true\">&uarr;</span>";
        upButton.setAttribute("aria-label", translateKey("account_explorer.setup.move_up"));
        upButton.title = translateKey("account_explorer.setup.move_up");
        if (index === 0) {
          upButton.disabled = true;
        }
        const downButton = document.createElement("button");
        downButton.type = "button";
        downButton.className = "btn btn-outline-secondary";
        downButton.dataset.action = "move-down";
        downButton.innerHTML = "<span aria-hidden=\"true\">&darr;</span>";
        downButton.setAttribute("aria-label", translateKey("account_explorer.setup.move_down"));
        downButton.title = translateKey("account_explorer.setup.move_down");
        if (index === setupObjectsState.length - 1) {
          downButton.disabled = true;
        }
        group.appendChild(upButton);
        group.appendChild(downButton);
        controls.appendChild(group);

        const toggleWrapper = document.createElement("div");
        toggleWrapper.className = "form-check form-switch mb-0";
        const toggleInput = document.createElement("input");
        toggleInput.className = "form-check-input";
        toggleInput.type = "checkbox";
        toggleInput.dataset.action = "toggle";
        toggleInput.checked = !definition.hidden;
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "form-check-label small";
        toggleLabel.textContent = translateKey("account_explorer.setup.show_label");
        toggleWrapper.appendChild(toggleInput);
        toggleWrapper.appendChild(toggleLabel);
        controls.appendChild(toggleWrapper);

        const badge = document.createElement("span");
        badge.className = "badge bg-secondary";
        badge.dataset.role = "hidden-badge";
        badge.textContent = translateKey("account_explorer.setup.hidden_badge");
        if (!definition.hidden) {
          badge.classList.add("d-none");
        }
        controls.appendChild(badge);

        item.appendChild(controls);
        setupObjectList.appendChild(item);
      });
    }

    function renderSetupFields() {
      if (!setupFieldsContainer) {
        return;
      }
      setupFieldInputs.clear();
      setupFieldDatalists.clear();
      setupFieldsContainer.innerHTML = "";
      setupObjectsState.forEach((definition, index) => {
        const objectKey = definition.key;
        const item = document.createElement("div");
        item.className = "accordion-item";
        item.dataset.object = objectKey;
        const header = document.createElement("h2");
        header.className = "accordion-header";
        header.id = `account-explorer-setup-heading-${index}`;
        const button = document.createElement("button");
        button.className = "accordion-button collapsed";
        button.type = "button";
        button.setAttribute("data-bs-toggle", "collapse");
        button.setAttribute(
          "data-bs-target",
          `#account-explorer-setup-collapse-${index}`
        );
        button.textContent = definition.label;
        header.appendChild(button);
        item.appendChild(header);
        const collapse = document.createElement("div");
        collapse.id = `account-explorer-setup-collapse-${index}`;
        collapse.className = "accordion-collapse collapse";
        collapse.setAttribute("data-bs-parent", "#account-explorer-setup-fields");
        const body = document.createElement("div");
        body.className = "accordion-body";
        const row = document.createElement("div");
        row.className = "row g-2";
        const inputs = [];
        for (let i = 0; i < 5; i += 1) {
          const col = document.createElement("div");
          col.className = "col-sm-6 col-lg-4";
          const input = document.createElement("input");
          input.type = "text";
          input.className = "form-control";
          input.placeholder = translateKey("account_explorer.setup.field_placeholder", {
            index: i + 1,
          });
          input.setAttribute("data-object", objectKey);
          input.setAttribute("data-index", String(i));
          input.setAttribute("list", `account-explorer-setup-datalist-${objectKey}`);
          input.addEventListener("focus", () => ensureObjectFieldsLoaded(objectKey));
          col.appendChild(input);
          row.appendChild(col);
          inputs.push(input);
        }
        body.appendChild(row);
        const datalist = document.createElement("datalist");
        datalist.id = `account-explorer-setup-datalist-${objectKey}`;
        body.appendChild(datalist);
        collapse.appendChild(body);
        item.appendChild(collapse);
        setupFieldsContainer.appendChild(item);
        setupFieldInputs.set(objectKey, inputs);
        setupFieldDatalists.set(objectKey, datalist);
      });
    }

    function populateSetupFieldValues() {
      setupFieldInputs.forEach((inputs, objectKey) => {
        const values = Array.isArray(configState?.fields?.[objectKey])
          ? configState.fields[objectKey]
          : [];
        inputs.forEach((input, index) => {
          input.value = values[index] || "";
        });
      });
    }

    function openSetupModal() {
      setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
      setupViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
      setupAlertsState = Array.isArray(configState.alerts)
        ? configState.alerts.map((alert) => ({ ...alert }))
        : [];
      renderSetupObjectList();
      renderSetupFields();
      renderSetupAlerts();
      populateSetupFieldValues();
      setupViewInputs.forEach((input) => {
        input.checked = input.value === setupViewMode;
      });
      setSetupStatus("", "muted");
    }

    function saveSetupConfiguration() {
      if (!setupSaveButton) {
        return;
      }
      setupSaveButton.disabled = true;
      setSetupStatus(translateKey("account_explorer.setup.saving"), "muted");
      const payload = {
        fields: gatherSetupFields(),
        objects: setupObjectsState.map((item) => ({
          key: item.key,
          hidden: Boolean(item.hidden),
        })),
        alerts: gatherSetupAlerts(),
        viewMode: setupViewMode,
      };
      fetch("/api/account-explorer/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) =>
          response
            .json()
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            throw new Error("save_failed");
          }
          configState = data?.config ? { ...data.config } : configState;
          configState.alerts = normalizeAlertsList(configState.alerts);
          resetAlertCache();
          objectDefinitions = normalizeObjectDefinitions(
            data?.connectedObjects || objectDefinitions
          );
          window.ACCOUNT_EXPLORER_CONFIG = configState;
          window.ACCOUNT_EXPLORER_OBJECTS = objectDefinitions;
          setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
          setupAlertsState = Array.isArray(configState.alerts)
            ? configState.alerts.map((alert) => ({ ...alert }))
            : [];
          populateSetupFieldValues();
          renderSetupObjectList();
          renderSetupAlerts();
          setupViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
          setupViewInputs.forEach((input) => {
            input.checked = input.value === setupViewMode;
          });
          setSetupStatus(translateKey("account_explorer.setup.saved"), "success");
          showToast(translateKey("frontend.account_explorer.config_saved"), "success");
          if (explorerResult && explorerResult.data) {
            explorerResult.data.objects = objectDefinitions;
            renderResults(explorerResult);
          } else {
            renderTree(selectedAccountId ? getAccountById(selectedAccountId) : null);
          }
          currentViewMode = configState.viewMode || currentViewMode;
          setViewMode(currentViewMode, { force: true });
        })
        .catch(() => {
          setSetupStatus(translateKey("account_explorer.setup.save_failed"), "danger");
          showToast(translateKey("frontend.account_explorer.config_failed"), "danger");
        })
        .finally(() => {
          setupSaveButton.disabled = false;
        });
    }

    if (parseButton) {
      parseButton.addEventListener("click", parseAccounts);
    }
    if (clearButton) {
      clearButton.addEventListener("click", clearInputs);
    }
    if (runButton) {
      runButton.addEventListener("click", runExplorer);
    }
    if (downloadButton) {
      downloadButton.addEventListener("click", () => {
        if (downloadButton.disabled) {
          showToast(translateKey("frontend.account_explorer.download_unavailable"), "warning");
          return;
        }
        window.open("/api/account-explorer/download", "_blank");
      });
    }
    if (orgSelect) {
      orgSelect.addEventListener("change", updateRunState);
    }
    if (viewListButton) {
      viewListButton.addEventListener("click", () => setViewMode("list"));
    }
    if (viewTreeButton) {
      viewTreeButton.addEventListener("click", () => setViewMode("tree"));
    }

    if (openTreeTabButton) {
      openTreeTabButton.addEventListener("click", openTreeInNewTab);
    }
    if (treeContent) {
      treeContent.addEventListener("click", handleTreeNodeInteraction);
      treeContent.addEventListener("keydown", handleTreeNodeInteraction);
    }
    if (setupButton && setupModalEl) {
      setupModalEl.addEventListener("show.bs.modal", openSetupModal);
    }
    if (setupSaveButton) {
      setupSaveButton.addEventListener("click", saveSetupConfiguration);
    }
    if (setupObjectList) {
      setupObjectList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
          return;
        }
        const item = button.closest("li[data-object]");
        if (!item) {
          return;
        }
        const objectKey = item.dataset.object;
        if (!objectKey) {
          return;
        }
        const index = setupObjectsState.findIndex((entry) => entry.key === objectKey);
        if (index === -1) {
          return;
        }
        if (button.dataset.action === "move-up" && index > 0) {
          const [entry] = setupObjectsState.splice(index, 1);
          setupObjectsState.splice(index - 1, 0, entry);
          renderSetupObjectList();
        }
        if (
          button.dataset.action === "move-down" &&
          index < setupObjectsState.length - 1
        ) {
          const [entry] = setupObjectsState.splice(index, 1);
          setupObjectsState.splice(index + 1, 0, entry);
          renderSetupObjectList();
        }
      });
      setupObjectList.addEventListener("change", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) {
          return;
        }
        if (input.dataset.action !== "toggle") {
          return;
        }
        const item = input.closest("li[data-object]");
        if (!item) {
          return;
        }
        const objectKey = item.dataset.object;
        const entry = setupObjectsState.find((definition) => definition.key === objectKey);
        if (!entry) {
          return;
        }
        entry.hidden = !input.checked;
        renderSetupObjectList();
      });
    }
    if (setupOrgSelect) {
      setupOrgSelect.addEventListener("change", () => {
        fieldCache.clear();
      });
    }
    setupViewInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          setupViewMode = VIEW_MODES.has(input.value) ? input.value : DEFAULT_VIEW_MODE;
        }
      });
    });

    if (setupAlertAddButton) {
      setupAlertAddButton.addEventListener("click", addAlertEntry);
    }
    if (setupAlertList) {
      setupAlertList.addEventListener("input", handleAlertListInput);
      setupAlertList.addEventListener("change", handleAlertListChange);
      setupAlertList.addEventListener("click", handleAlertListClick);
    }

    fetchOrgs();

    const initialResult = window.ACCOUNT_EXPLORER_RESULT;
    if (initialResult && initialResult.data) {
      explorerResult = initialResult;
      accountIds = Array.isArray(initialResult.accountIds)
        ? initialResult.accountIds
        : [];
      renderPreview();
      renderResults(initialResult);
    } else {
      renderPreview();
      setViewMode(currentViewMode, { force: true });
    }

    updateRunState();
  });
})();
