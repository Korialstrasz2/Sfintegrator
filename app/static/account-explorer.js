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

  function insertTextAtCursor(textarea, text) {
    if (!textarea || typeof text !== "string") {
      return;
    }
    const value = textarea.value || "";
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    textarea.value = `${before}${text}${after}`;
    const caret = start + text.length;
    if (typeof textarea.setSelectionRange === "function") {
      textarea.setSelectionRange(caret, caret);
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function generateAlertId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `alert-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
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
    const accountAlertsContainer = document.getElementById("account-explorer-account-alerts");
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
    const setupAlertsContainer = document.getElementById("account-explorer-setup-alerts");
    const setupAlertAddButton = document.getElementById("account-explorer-setup-alert-add");
    const setupViewInputs = Array.from(
      document.querySelectorAll('input[name="account-explorer-setup-view"]')
    );

    if (!parseButton || !clearButton || !previewList || !orgSelect) {
      return;
    }

    let accountIds = [];
    let explorerResult = null;
    let selectedAccountId = null;
    let availableOrgs = [];
    let latestTreeAccount = null;
    let latestTreeContext = null;

    let objectDefinitions = normalizeObjectDefinitions(window.ACCOUNT_EXPLORER_OBJECTS);
    let configState =
      typeof window.ACCOUNT_EXPLORER_CONFIG === "object" && window.ACCOUNT_EXPLORER_CONFIG
        ? { ...window.ACCOUNT_EXPLORER_CONFIG }
        : { fields: {}, objects: [], viewMode: DEFAULT_VIEW_MODE };
    if (!VIEW_MODES.has(configState.viewMode)) {
      configState.viewMode = DEFAULT_VIEW_MODE;
    }
    let currentViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
    configState.alerts = Array.isArray(configState.alerts)
      ? configState.alerts
          .map((entry) => normalizeAlertConfig(entry))
          .filter(Boolean)
      : [];

    let setupObjectsState = [];
    let setupViewMode = currentViewMode;
    let setupAlertsState = [];
    const setupFieldInputs = new Map();
    const setupFieldDatalists = new Map();
    const alertFieldDatalists = new Map();
    const fieldCache = new Map();
    let activeTooltips = [];

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
      const options = [
        {
          key: "Account",
          label: translateKey("account_explorer.results.account_label"),
        },
      ];
      const seen = new Set(options.map((item) => item.key));
      objectDefinitions.forEach((definition) => {
        if (!definition || !definition.key || seen.has(definition.key)) {
          return;
        }
        options.push({ key: definition.key, label: definition.label || definition.key });
        seen.add(definition.key);
      });
      return options;
    }

    function normalizeAlertConfig(raw) {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateAlertId();
      const objectValue =
        typeof raw.object === "string"
          ? raw.object
          : typeof raw.objectKey === "string"
          ? raw.objectKey
          : "";
      let objectKey = "";
      if (objectValue) {
        const options = getAlertObjectOptions();
        const match = options.find((option) => option.key.toLowerCase() === objectValue.toLowerCase());
        if (match) {
          objectKey = match.key;
        }
      }
      const label = typeof raw.label === "string" ? raw.label.trim() : "";
      const expression = typeof raw.expression === "string" ? raw.expression : "";
      const description = typeof raw.description === "string" ? raw.description : "";
      return {
        id,
        label,
        object: objectKey,
        expression,
        description,
      };
    }

    function formatAlertTooltip(alert) {
      if (!alert) {
        return "";
      }
      const label = alert.label || alert.id || "";
      const description = alert.description ? ` — ${alert.description}` : "";
      return `${label}${description}`;
    }

    function createAlertBadgeList(alerts, { showDescription = false, compact = false } = {}) {
      const list = Array.isArray(alerts) ? alerts : [];
      const container = document.createElement("div");
      container.className = "account-alert-badges";
      if (compact) {
        container.classList.add("account-alert-badges--compact");
      }
      list.forEach((alert) => {
        if (!alert) {
          return;
        }
        const item = document.createElement("div");
        item.className = "account-alert-badge";
        const badge = document.createElement("span");
        badge.className = "badge bg-danger";
        badge.textContent = alert.label || alert.id || translateKey("account_explorer.alerts.unnamed");
        item.appendChild(badge);
        if (showDescription && alert.description) {
          const text = document.createElement("span");
          text.className = "account-alert-badge__description";
          text.textContent = alert.description;
          item.appendChild(text);
        }
        item.setAttribute("data-bs-toggle", "tooltip");
        item.setAttribute("data-bs-placement", "top");
        item.setAttribute("title", formatAlertTooltip(alert));
        container.appendChild(item);
      });
      return container;
    }

    function renderAccountAlerts(alerts) {
      if (!accountAlertsContainer) {
        return;
      }
      accountAlertsContainer.innerHTML = "";
      const list = Array.isArray(alerts) ? alerts : [];
      if (!list.length) {
        accountAlertsContainer.classList.add("d-none");
        return;
      }
      accountAlertsContainer.classList.remove("d-none");
      const heading = document.createElement("div");
      heading.className = "account-alerts-heading";
      heading.textContent = translateKey("account_explorer.results.alerts_heading");
      accountAlertsContainer.appendChild(heading);
      const badges = createAlertBadgeList(list, { showDescription: true });
      accountAlertsContainer.appendChild(badges);
      refreshTooltips(accountAlertsContainer);
    }

    function disposeTooltips() {
      if (!activeTooltips.length) {
        return;
      }
      activeTooltips.forEach((tooltip) => {
        if (tooltip && typeof tooltip.dispose === "function") {
          tooltip.dispose();
        }
      });
      activeTooltips = [];
    }

    function refreshTooltips(root) {
      if (typeof bootstrap === "undefined" || !bootstrap.Tooltip) {
        return;
      }
      const context = root || document;
      if (root && activeTooltips.length) {
        activeTooltips = activeTooltips.filter((tooltip) => {
          const element = tooltip && (tooltip._element || tooltip.element);
          if (!element) {
            return false;
          }
          if (context.contains(element)) {
            if (typeof tooltip.dispose === "function") {
              tooltip.dispose();
            }
            return false;
          }
          return true;
        });
      }
      const elements = context.querySelectorAll('[data-bs-toggle="tooltip"]');
      const tooltips = [];
      elements.forEach((element) => {
        tooltips.push(new bootstrap.Tooltip(element));
      });
      if (tooltips.length) {
        activeTooltips.push(...tooltips);
      }
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

    function renderRelatedSection(container, related) {
      container.innerHTML = "";
      const visibleObjects = getVisibleObjects();
      if (!visibleObjects.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.results.no_objects");
        container.appendChild(empty);
        return;
      }
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
            const card = createRecordCard(record, key);
            section.appendChild(card);
          });
        }
        container.appendChild(section);
        refreshTooltips(section);
      });
    }

    function createRecordCard(record, objectKey) {
      const card = document.createElement("div");
      const alerts = Array.isArray(record.alerts) ? record.alerts : [];
      const cardClasses = ["border", "rounded", "p-2", "mb-2"];
      if (alerts.length) {
        cardClasses.push("account-alert-card");
      }
      card.className = cardClasses.join(" ");
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
      if (alerts.length) {
        const alertsContainer = createAlertBadgeList(alerts, { compact: true });
        alertsContainer.classList.add("mb-2");
        card.setAttribute("data-bs-toggle", "tooltip");
        card.setAttribute("data-bs-placement", "top");
        card.setAttribute("title", alerts.map((alert) => formatAlertTooltip(alert)).join("\n"));
        card.appendChild(alertsContainer);
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

    function createTreeRecordNode(record, objectKey, { label, showFields = true } = {}) {
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
      const alerts = Array.isArray(record.alerts) ? record.alerts : [];
      if (alerts.length) {
        node.classList.add("account-alert-node");
        node.setAttribute("data-bs-toggle", "tooltip");
        node.setAttribute("data-bs-placement", "top");
        node.setAttribute("title", alerts.map((alert) => formatAlertTooltip(alert)).join("\n"));
        const badges = createAlertBadgeList(alerts, { compact: true });
        node.appendChild(badges);
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
      const alerts = Array.isArray(account.alerts) ? account.alerts : [];
      if (alerts.length) {
        title.classList.add("account-alert-heading");
        const badges = createAlertBadgeList(alerts, { showDescription: true });
        badges.classList.add("account-tree-header__alerts");
        header.appendChild(badges);
      }
      return header;
    }

    function buildAccountTreeDiagram(account, context, { fullWidth = false } = {}) {
      const diagram = document.createElement("div");
      diagram.className = "account-tree-diagram";
      if (fullWidth) {
        diagram.classList.add("account-tree-diagram--full");
      }
      const accountNode = createTreeRecordNode(account, "Account", {
        label: translateKey("account_explorer.results.account_label"),
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
      };

      const header = createTreeHeader(account);
      if (header) {
        treeContent.appendChild(header);
      }

      const diagram = buildAccountTreeDiagram(account, context);
      treeContent.appendChild(diagram);
      treeContent.scrollLeft = 0;
      refreshTooltips(treeContent);

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
        accountEmpty.classList.remove("d-none");
        renderAccountAlerts([]);
        accountHeading.classList.remove("account-alert-heading");
        return;
      }
      accountEmpty.classList.add("d-none");
      accountDetails.classList.remove("d-none");
      accountHeading.textContent = getAccountDisplayName(account) || account.id;
      renderFieldList(accountFields, account.fields || []);
      const accountAlerts = Array.isArray(account.alerts) ? account.alerts : [];
      renderAccountAlerts(accountAlerts);
      accountHeading.classList.toggle("account-alert-heading", accountAlerts.length > 0);
      renderRelatedSection(accountRelated, account.related || {});
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
      disposeTooltips();
      accountList.innerHTML = "";
      accounts.forEach((account) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "list-group-item list-group-item-action d-flex align-items-start justify-content-between gap-2";
        button.dataset.accountId = account.id;
        const title = document.createElement("div");
        title.className = "fw-semibold";
        title.textContent = getAccountDisplayName(account);
        const subtitle = document.createElement("div");
        subtitle.className = "small text-muted";
        subtitle.textContent = account.id;
        const content = document.createElement("div");
        content.className = "flex-grow-1 account-list-item__content";
        content.appendChild(title);
        content.appendChild(subtitle);
        button.appendChild(content);
        const accountAlerts = Array.isArray(account.alerts) ? account.alerts : [];
        if (accountAlerts.length) {
          button.classList.add("account-alert-list-item");
          button.setAttribute("data-bs-toggle", "tooltip");
          button.setAttribute("data-bs-placement", "right");
          button.setAttribute(
            "title",
            accountAlerts.map((alert) => formatAlertTooltip(alert)).join("\n")
          );
          const badgeContainer = document.createElement("div");
          badgeContainer.className = "account-alert-list-badges d-flex flex-column align-items-end";
          const badge = document.createElement("span");
          badge.className = "badge bg-danger";
          badge.textContent = translateKey("account_explorer.alerts.badge_short", {
            count: accountAlerts.length,
          });
          badgeContainer.appendChild(badge);
          button.appendChild(badgeContainer);
        }
        button.addEventListener("click", () => {
          renderAccount(account.id);
        });
        accountList.appendChild(button);
      });
      refreshTooltips(accountList);
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
      refreshTooltips(resultsContainer);
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

    function getFieldsForObject(objectKey) {
      if (!objectKey) {
        return Promise.resolve([]);
      }
      if (!setupOrgSelect || !setupOrgSelect.value) {
        return Promise.reject(new Error("no-org"));
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
        });
    }

    function ensureObjectFieldsLoaded(objectKey) {
      if (!objectKey) {
        return;
      }
      getFieldsForObject(objectKey)
        .then((fields) => {
          fillDatalist(objectKey, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no-org") {
            showToast(translateKey("frontend.account_explorer.no_org"), "warning");
            return;
          }
          showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
        });
    }

    function renderFieldOptionsInDatalist(datalist, fields) {
      if (!datalist) {
        return;
      }
      datalist.innerHTML = "";
      fields.forEach((field) => {
        const option = document.createElement("option");
        option.value = field?.name || "";
        if (field?.label) {
          option.label = `${field.label} (${field.name})`;
        }
        datalist.appendChild(option);
      });
    }

    function fillDatalist(objectKey, fields) {
      const datalist = setupFieldDatalists.get(objectKey);
      renderFieldOptionsInDatalist(datalist, fields);
    }

    function loadAlertFieldOptions(alertId, objectKey) {
      if (!alertId || !objectKey) {
        return;
      }
      getFieldsForObject(objectKey)
        .then((fields) => {
          const datalist = alertFieldDatalists.get(alertId);
          renderFieldOptionsInDatalist(datalist, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no-org") {
            showToast(translateKey("frontend.account_explorer.no_org"), "warning");
            return;
          }
          showToast(translateKey("frontend.account_explorer.alerts.fields_failed"), "danger");
        });
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

    function renderSetupAlerts() {
      if (!setupAlertsContainer) {
        return;
      }
      alertFieldDatalists.clear();
      setupAlertsContainer.innerHTML = "";
      if (!setupAlertsState.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.setup.alerts_empty");
        setupAlertsContainer.appendChild(empty);
        return;
      }
      setupAlertsState.forEach((alert, index) => {
        const card = document.createElement("div");
        card.className = "card account-alert-config";
        card.dataset.alertId = alert.id;
        const body = document.createElement("div");
        body.className = "card-body";

        const header = document.createElement("div");
        header.className = "d-flex justify-content-between align-items-start mb-3 gap-2";
        const title = document.createElement("h6");
        title.className = "fw-semibold mb-0";
        title.textContent = alert.label
          ? alert.label
          : translateKey("account_explorer.setup.alerts_default_title", { index: index + 1 });
        header.appendChild(title);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.dataset.action = "remove-alert";
        removeButton.textContent = translateKey("account_explorer.setup.alerts_remove_button");
        header.appendChild(removeButton);
        body.appendChild(header);

        const labelGroup = document.createElement("div");
        labelGroup.className = "mb-3";
        const labelLabel = document.createElement("label");
        labelLabel.className = "form-label";
        labelLabel.setAttribute("for", `account-explorer-alert-label-${alert.id}`);
        labelLabel.textContent = translateKey("account_explorer.setup.alerts_label");
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.className = "form-control";
        labelInput.id = `account-explorer-alert-label-${alert.id}`;
        labelInput.value = alert.label || "";
        labelInput.dataset.field = "label";
        labelGroup.appendChild(labelLabel);
        labelGroup.appendChild(labelInput);
        body.appendChild(labelGroup);

        const objectGroup = document.createElement("div");
        objectGroup.className = "mb-3";
        const objectLabel = document.createElement("label");
        objectLabel.className = "form-label";
        objectLabel.setAttribute("for", `account-explorer-alert-object-${alert.id}`);
        objectLabel.textContent = translateKey("account_explorer.setup.alerts_object_label");
        const objectSelect = document.createElement("select");
        objectSelect.className = "form-select";
        objectSelect.id = `account-explorer-alert-object-${alert.id}`;
        objectSelect.dataset.field = "object";
        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = translateKey("account_explorer.setup.alerts_object_placeholder");
        objectSelect.appendChild(placeholderOption);
        getAlertObjectOptions().forEach((option) => {
          const optionEl = document.createElement("option");
          optionEl.value = option.key;
          optionEl.textContent = option.label;
          objectSelect.appendChild(optionEl);
        });
        objectSelect.value = alert.object || "";
        objectGroup.appendChild(objectLabel);
        objectGroup.appendChild(objectSelect);
        const objectHelp = document.createElement("div");
        objectHelp.className = "form-text";
        objectHelp.textContent = translateKey("account_explorer.setup.alerts_object_help");
        objectGroup.appendChild(objectHelp);
        body.appendChild(objectGroup);

        const descriptionGroup = document.createElement("div");
        descriptionGroup.className = "mb-3";
        const descriptionLabel = document.createElement("label");
        descriptionLabel.className = "form-label";
        descriptionLabel.setAttribute("for", `account-explorer-alert-description-${alert.id}`);
        descriptionLabel.textContent = translateKey("account_explorer.setup.alerts_description_label");
        const descriptionInput = document.createElement("input");
        descriptionInput.type = "text";
        descriptionInput.className = "form-control";
        descriptionInput.id = `account-explorer-alert-description-${alert.id}`;
        descriptionInput.value = alert.description || "";
        descriptionInput.dataset.field = "description";
        descriptionGroup.appendChild(descriptionLabel);
        descriptionGroup.appendChild(descriptionInput);
        body.appendChild(descriptionGroup);

        const expressionGroup = document.createElement("div");
        expressionGroup.className = "mb-3";
        const expressionLabel = document.createElement("label");
        expressionLabel.className = "form-label";
        expressionLabel.setAttribute("for", `account-explorer-alert-expression-${alert.id}`);
        expressionLabel.textContent = translateKey("account_explorer.setup.alerts_condition_label");
        const expressionTextarea = document.createElement("textarea");
        expressionTextarea.className = "form-control font-monospace";
        expressionTextarea.id = `account-explorer-alert-expression-${alert.id}`;
        expressionTextarea.rows = 3;
        expressionTextarea.dataset.field = "expression";
        expressionTextarea.value = alert.expression || "";
        const expressionHelp = document.createElement("div");
        expressionHelp.className = "form-text";
        expressionHelp.textContent = translateKey("account_explorer.setup.alerts_condition_help");
        expressionGroup.appendChild(expressionLabel);
        expressionGroup.appendChild(expressionTextarea);
        expressionGroup.appendChild(expressionHelp);
        body.appendChild(expressionGroup);

        const fieldGroup = document.createElement("div");
        fieldGroup.className = "mb-3";
        const fieldLabel = document.createElement("label");
        fieldLabel.className = "form-label";
        fieldLabel.setAttribute("for", `account-explorer-alert-field-${alert.id}`);
        fieldLabel.textContent = translateKey("account_explorer.setup.alerts_field_label");
        const inputGroup = document.createElement("div");
        inputGroup.className = "input-group";
        const fieldInput = document.createElement("input");
        fieldInput.type = "text";
        fieldInput.className = "form-control";
        fieldInput.id = `account-explorer-alert-field-${alert.id}`;
        fieldInput.placeholder = translateKey("account_explorer.setup.alerts_field_placeholder");
        fieldInput.dataset.role = "alert-field-input";
        fieldInput.setAttribute("list", `account-explorer-alert-fields-${alert.id}`);
        const insertButton = document.createElement("button");
        insertButton.type = "button";
        insertButton.className = "btn btn-outline-secondary";
        insertButton.dataset.action = "insert-field";
        insertButton.textContent = translateKey("account_explorer.setup.alerts_insert_button");
        inputGroup.appendChild(fieldInput);
        inputGroup.appendChild(insertButton);
        fieldGroup.appendChild(fieldLabel);
        fieldGroup.appendChild(inputGroup);
        const fieldHelp = document.createElement("div");
        fieldHelp.className = "form-text";
        fieldHelp.textContent = translateKey("account_explorer.setup.alerts_insert_help");
        fieldGroup.appendChild(fieldHelp);
        const datalist = document.createElement("datalist");
        datalist.id = `account-explorer-alert-fields-${alert.id}`;
        alertFieldDatalists.set(alert.id, datalist);
        fieldGroup.appendChild(datalist);
        body.appendChild(fieldGroup);

        card.appendChild(body);
        setupAlertsContainer.appendChild(card);
        if (alert.object) {
          loadAlertFieldOptions(alert.id, alert.object);
        }
      });
    }

    function gatherSetupAlerts() {
      return setupAlertsState.map((alert) => ({
        id: alert.id,
        label: (alert.label || "").trim(),
        object: alert.object || "",
        expression: alert.expression || "",
        description: (alert.description || "").trim(),
      }));
    }


    function openSetupModal() {
      setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
      setupViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
      setupAlertsState = configState.alerts.map((item) => ({ ...item }));
      renderSetupObjectList();
      renderSetupFields();
      populateSetupFieldValues();
      renderSetupAlerts();
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
        viewMode: setupViewMode,
        alerts: gatherSetupAlerts(),
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
          configState.alerts = Array.isArray(configState.alerts)
            ? configState.alerts
                .map((entry) => normalizeAlertConfig(entry))
                .filter(Boolean)
            : [];
          objectDefinitions = normalizeObjectDefinitions(
            data?.connectedObjects || objectDefinitions
          );
          window.ACCOUNT_EXPLORER_CONFIG = configState;
          window.ACCOUNT_EXPLORER_OBJECTS = objectDefinitions;
          setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
          populateSetupFieldValues();
          renderSetupObjectList();
          setupAlertsState = configState.alerts.map((item) => ({ ...item }));
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
        renderSetupAlerts();
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
      setupAlertAddButton.addEventListener("click", () => {
        const newAlert = {
          id: generateAlertId(),
          label: "",
          object: "",
          expression: "",
          description: "",
        };
        setupAlertsState.push(newAlert);
        renderSetupAlerts();
      });
    }

    if (setupAlertsContainer) {
      setupAlertsContainer.addEventListener("input", (event) => {
        const target = event.target;
        if (
          !(
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
          )
        ) {
          return;
        }
        const card = target.closest("[data-alert-id]");
        if (!card) {
          return;
        }
        const alertId = card.dataset.alertId;
        const alert = setupAlertsState.find((item) => item.id === alertId);
        if (!alert) {
          return;
        }
        if (target.dataset.field === "label") {
          alert.label = target.value;
          const title = card.querySelector("h6");
          if (title) {
            if (alert.label.trim()) {
              title.textContent = alert.label.trim();
            } else {
              const index = setupAlertsState.findIndex((item) => item.id === alertId);
              title.textContent = translateKey("account_explorer.setup.alerts_default_title", {
                index: index + 1,
              });
            }
          }
        }
        if (target.dataset.field === "description") {
          alert.description = target.value;
        }
        if (target.dataset.field === "expression") {
          alert.expression = target.value;
        }
      });

      setupAlertsContainer.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
          return;
        }
        if (target.dataset.field !== "object") {
          return;
        }
        const card = target.closest("[data-alert-id]");
        if (!card) {
          return;
        }
        const alertId = card.dataset.alertId;
        const alert = setupAlertsState.find((item) => item.id === alertId);
        if (!alert) {
          return;
        }
        alert.object = target.value || "";
        loadAlertFieldOptions(alert.id, alert.object);
      });

      setupAlertsContainer.addEventListener("focusin", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        if (target.dataset.role !== "alert-field-input") {
          return;
        }
        const card = target.closest("[data-alert-id]");
        if (!card) {
          return;
        }
        const alertId = card.dataset.alertId;
        const alert = setupAlertsState.find((item) => item.id === alertId);
        if (!alert || !alert.object) {
          return;
        }
        loadAlertFieldOptions(alert.id, alert.object);
      });

      setupAlertsContainer.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
          return;
        }
        const card = button.closest("[data-alert-id]");
        if (!card) {
          return;
        }
        const alertId = card.dataset.alertId;
        if (!alertId) {
          return;
        }
        if (button.dataset.action === "remove-alert") {
          setupAlertsState = setupAlertsState.filter((item) => item.id !== alertId);
          renderSetupAlerts();
          return;
        }
        if (button.dataset.action === "insert-field") {
          const alert = setupAlertsState.find((item) => item.id === alertId);
          if (!alert) {
            return;
          }
          if (!alert.object) {
            showToast(translateKey("frontend.account_explorer.alerts.no_object"), "warning");
            return;
          }
          const fieldInput = card.querySelector('input[data-role="alert-field-input"]');
          const expressionTextarea = card.querySelector('textarea[data-field="expression"]');
          const fieldName = fieldInput ? fieldInput.value.trim() : "";
          if (!fieldName) {
            showToast(translateKey("frontend.account_explorer.alerts.no_field"), "warning");
            return;
          }
          if (expressionTextarea instanceof HTMLTextAreaElement) {
            const token = `${alert.object}.${fieldName}`;
            insertTextAtCursor(expressionTextarea, token);
          }
          if (fieldInput instanceof HTMLInputElement) {
            fieldInput.value = "";
          }
        }
      });
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
