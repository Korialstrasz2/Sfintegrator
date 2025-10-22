(function () {
  const DEFAULT_VIEW_MODE = "list";
  const VIEW_MODES = new Set(["list", "tree"]);

  const CONTACT_LINK_FIELDS = ["ContactId", "Contact__c", "Contact", "ParentId"];
  const INDIVIDUAL_LINK_FIELDS = ["IndividualId", "Individual__c", "ParentId"];
  const CONTACT_POINT_OBJECTS = new Set(["ContactPointPhone", "ContactPointEmail"]);
  const CONTACT_POINT_SOURCE_DEFAULTS = { contact: true, individual: true };
  const CONTACT_POINT_SOURCE_LABEL_KEYS = {
    contact: "account_explorer.results.contact_point_sources.contact",
    individual: "account_explorer.results.contact_point_sources.individual",
  };

  const ALERT_OPERATORS = [
    { value: "equals", labelKey: "account_explorer.setup.alerts.operators.equals", needsValue: true },
    {
      value: "equals_ignore_case",
      labelKey: "account_explorer.setup.alerts.operators.equals_ignore_case",
      needsValue: true,
    },
    { value: "not_equals", labelKey: "account_explorer.setup.alerts.operators.not_equals", needsValue: true },
    { value: "contains", labelKey: "account_explorer.setup.alerts.operators.contains", needsValue: true },
    {
      value: "not_contains",
      labelKey: "account_explorer.setup.alerts.operators.not_contains",
      needsValue: true,
    },
    { value: "starts_with", labelKey: "account_explorer.setup.alerts.operators.starts_with", needsValue: true },
    { value: "blank", labelKey: "account_explorer.setup.alerts.operators.blank", needsValue: false },
    { value: "not_blank", labelKey: "account_explorer.setup.alerts.operators.not_blank", needsValue: false },
    { value: "null", labelKey: "account_explorer.setup.alerts.operators.null", needsValue: false },
    { value: "not_null", labelKey: "account_explorer.setup.alerts.operators.not_null", needsValue: false },
  ];

  const ALERT_OPERATOR_LOOKUP = new Map(ALERT_OPERATORS.map((operator) => [operator.value, operator]));

  const ADVANCED_ALERT_MODES = {
    SIMPLE: "simple",
    ADVANCED: "advanced",
  };

  const ADVANCED_GROUP_OPTIONS = [
    {
      value: "and",
      labelKey: "account_explorer.setup.alerts.advanced.group_logic_all",
    },
    {
      value: "or",
      labelKey: "account_explorer.setup.alerts.advanced.group_logic_any",
    },
  ];

  const ADVANCED_SCOPE_MATCHES = [
    {
      value: "any",
      labelKey: "account_explorer.setup.alerts.advanced.scope_match_any",
    },
    {
      value: "all",
      labelKey: "account_explorer.setup.alerts.advanced.scope_match_all",
    },
    {
      value: "not_all",
      labelKey: "account_explorer.setup.alerts.advanced.scope_match_not_all",
    },
    {
      value: "none",
      labelKey: "account_explorer.setup.alerts.advanced.scope_match_none",
    },
  ];

  const ADVANCED_AGGREGATE_OPERATIONS = [
    {
      value: "duplicates",
      labelKey: "account_explorer.setup.alerts.advanced.aggregate_duplicates",
    },
  ];

  const ADVANCED_GROUP_LOOKUP = new Map(
    ADVANCED_GROUP_OPTIONS.map((option) => [option.value, option])
  );
  const ADVANCED_SCOPE_MATCH_LOOKUP = new Map(
    ADVANCED_SCOPE_MATCHES.map((option) => [option.value, option])
  );
  const ADVANCED_AGGREGATE_LOOKUP = new Map(
    ADVANCED_AGGREGATE_OPERATIONS.map((option) => [option.value, option])
  );

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

  function resolveContactPointSourceConfig(config, objectKey) {
    const defaults = { ...CONTACT_POINT_SOURCE_DEFAULTS };
    if (!config || typeof config !== "object") {
      return defaults;
    }
    const entry = config[objectKey];
    if (!entry || typeof entry !== "object") {
      return defaults;
    }
    if (typeof entry.contact === "boolean") {
      defaults.contact = entry.contact;
    }
    if (typeof entry.individual === "boolean") {
      defaults.individual = entry.individual;
    }
    return defaults;
  }

  function getObjectDefinitions() {
    if (Array.isArray(window.ACCOUNT_EXPLORER_OBJECTS)) {
      return window.ACCOUNT_EXPLORER_OBJECTS;
    }
    return [];
  }

  function getObjectLabel(key) {
    if (key === "Account") {
      return translateKey("account_explorer.results.account_label");
    }
    const definitions = getObjectDefinitions();
    const definition = definitions.find((item) => item && item.key === key);
    return definition ? definition.label : key;
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

  function generateAlertId(prefix = "alert") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  }

  function normalizeOperator(value) {
    if (ALERT_OPERATOR_LOOKUP.has(value)) {
      return value;
    }
    return ALERT_OPERATORS[0]?.value || "equals";
  }

  function operatorRequiresValue(operator) {
    const definition = ALERT_OPERATOR_LOOKUP.get(operator);
    if (!definition) {
      return true;
    }
    return Boolean(definition.needsValue);
  }

  function normalizeAdvancedGroupLogic(value) {
    if (ADVANCED_GROUP_LOOKUP.has(value)) {
      return value;
    }
    return ADVANCED_GROUP_OPTIONS[0]?.value || "and";
  }

  function normalizeAdvancedScopeMatch(value) {
    if (ADVANCED_SCOPE_MATCH_LOOKUP.has(value)) {
      return value;
    }
    return ADVANCED_SCOPE_MATCHES[0]?.value || "any";
  }

  function normalizeAdvancedAggregateOperation(value) {
    if (ADVANCED_AGGREGATE_LOOKUP.has(value)) {
      return value;
    }
    return ADVANCED_AGGREGATE_OPERATIONS[0]?.value || "duplicates";
  }

  function createAlertFilter(existing) {
    const filter = existing || {};
    return {
      id: generateAlertId("filter"),
      object: typeof filter.object === "string" ? filter.object : "",
      field: typeof filter.field === "string" ? filter.field : "",
      operator: normalizeOperator(filter.operator),
      value:
        typeof filter.value === "string"
          ? filter.value
          : filter.value !== undefined && filter.value !== null
          ? String(filter.value)
          : "",
    };
  }

  function createAdvancedGroup(existing) {
    const group = existing || {};
    const children = Array.isArray(group.children)
      ? group.children
          .map((child) => cloneAdvancedNode(child))
          .filter((child) => Boolean(child))
      : [];
    return {
      id:
        typeof group.id === "string" && group.id
          ? group.id
          : generateAlertId("adv-group"),
      type: "group",
      logic: normalizeAdvancedGroupLogic(group.logic),
      children,
    };
  }

  function createAdvancedCondition(existing, { objectKey } = {}) {
    const condition = existing || {};
    const operator = normalizeOperator(condition.operator);
    const requiresValue = operatorRequiresValue(operator);
    const value = typeof condition.value === "string" ? condition.value : "";
    return {
      id:
        typeof condition.id === "string" && condition.id
          ? condition.id
          : generateAlertId("adv-condition"),
      type: "condition",
      object:
        typeof condition.object === "string" && condition.object
          ? condition.object
          : typeof objectKey === "string"
          ? objectKey
          : "",
      field: typeof condition.field === "string" ? condition.field : "",
      operator,
      value: requiresValue ? value : "",
    };
  }

  function createAdvancedScope(existing) {
    const scope = existing || {};
    const children = Array.isArray(scope.children)
      ? scope.children
          .map((child) => cloneAdvancedNode(child))
          .filter((child) => Boolean(child) && child.type !== "scope")
      : [];
    return {
      id:
        typeof scope.id === "string" && scope.id
          ? scope.id
          : generateAlertId("adv-scope"),
      type: "scope",
      object: typeof scope.object === "string" ? scope.object : "",
      match: normalizeAdvancedScopeMatch(scope.match),
      children,
    };
  }

  function createAdvancedAggregate(existing) {
    const aggregate = existing || {};
    const minCountRaw = parseInt(aggregate.minCount, 10);
    const minCount = Number.isNaN(minCountRaw) ? 2 : Math.max(2, minCountRaw);
    const criteriaNode =
      aggregate.criteria && typeof aggregate.criteria === "object"
        ? cloneAdvancedNode(aggregate.criteria)
        : null;
    return {
      id:
        typeof aggregate.id === "string" && aggregate.id
          ? aggregate.id
          : generateAlertId("adv-aggregate"),
      type: "aggregate",
      object: typeof aggregate.object === "string" ? aggregate.object : "",
      operation: normalizeAdvancedAggregateOperation(aggregate.operation),
      field: typeof aggregate.field === "string" ? aggregate.field : "",
      minCount,
      distinctField:
        typeof aggregate.distinctField === "string" ? aggregate.distinctField : "",
      criteria: criteriaNode,
    };
  }

  function cloneAdvancedNode(node, options = {}) {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.type === "group") {
      return createAdvancedGroup(node);
    }
    if (node.type === "condition") {
      return createAdvancedCondition(node, options);
    }
    if (node.type === "scope") {
      return createAdvancedScope(node);
    }
    if (node.type === "aggregate") {
      return createAdvancedAggregate(node);
    }
    return null;
  }

  function createDefaultAdvancedRoot() {
    return createAdvancedGroup({ logic: ADVANCED_GROUP_OPTIONS[0]?.value, children: [] });
  }

  function ensureAdvancedRoot(alert) {
    if (!alert || typeof alert !== "object") {
      return null;
    }
    if (!alert.advanced || typeof alert.advanced !== "object") {
      alert.advanced = createDefaultAdvancedRoot();
    }
    if (!alert.advanced.id) {
      alert.advanced.id = generateAlertId("adv-group");
    }
    if (!Array.isArray(alert.advanced.children)) {
      alert.advanced.children = [];
    }
    return alert.advanced;
  }

  function visitAdvancedNodes(node, callback, parent = null, meta = null) {
    if (!node || typeof node !== "object") {
      return false;
    }
    if (callback(node, parent, meta) === true) {
      return true;
    }
    if (node.type === "group" || node.type === "scope") {
      const children = Array.isArray(node.children) ? node.children : [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (
          visitAdvancedNodes(child, callback, node, { key: "children", index }) === true
        ) {
          return true;
        }
      }
    }
    if (node.type === "aggregate" && node.criteria) {
      if (
        visitAdvancedNodes(node.criteria, callback, node, {
          key: "criteria",
          index: 0,
        }) === true
      ) {
        return true;
      }
    }
    return false;
  }

  function findAdvancedNodeById(alert, nodeId) {
    if (!alert || !nodeId) {
      return null;
    }
    const root = ensureAdvancedRoot(alert);
    if (!root) {
      return null;
    }
    if (root.id === nodeId) {
      return { node: root, parent: null, meta: null };
    }
    let result = null;
    visitAdvancedNodes(root, (node, parent, meta) => {
      if (node && node.id === nodeId) {
        result = { node, parent, meta };
        return true;
      }
      return false;
    });
    return result;
  }

  function addAdvancedScope(alert, parentId) {
    const root = ensureAdvancedRoot(alert);
    if (!root) {
      return null;
    }
    let parentNode = root;
    if (parentId && parentId !== root.id) {
      const found = findAdvancedNodeById(alert, parentId);
      if (!found || !found.node || found.node.type !== "group") {
        return null;
      }
      parentNode = found.node;
    }
    if (!Array.isArray(parentNode.children)) {
      parentNode.children = [];
    }
    const scope = createAdvancedScope({});
    parentNode.children.push(scope);
    return scope;
  }

  function addAdvancedCondition(alert, parentId, { objectKey } = {}) {
    const root = ensureAdvancedRoot(alert);
    if (!root) {
      return null;
    }
    let parentNode = root;
    if (parentId && parentId !== root.id) {
      const found = findAdvancedNodeById(alert, parentId);
      if (!found || !found.node) {
        return null;
      }
      parentNode = found.node;
    }
    if (parentNode.type !== "group" && parentNode.type !== "scope") {
      return null;
    }
    if (!Array.isArray(parentNode.children)) {
      parentNode.children = [];
    }
    const scopeObject = parentNode.type === "scope" ? parentNode.object : objectKey;
    const condition = createAdvancedCondition({}, { objectKey: scopeObject });
    parentNode.children.push(condition);
    return condition;
  }

  function addAdvancedGroupNode(alert, parentId) {
    const root = ensureAdvancedRoot(alert);
    if (!root) {
      return null;
    }
    let parentNode = root;
    if (parentId && parentId !== root.id) {
      const found = findAdvancedNodeById(alert, parentId);
      if (!found || !found.node) {
        return null;
      }
      parentNode = found.node;
    }
    if (parentNode.type !== "group" && parentNode.type !== "scope") {
      return null;
    }
    if (!Array.isArray(parentNode.children)) {
      parentNode.children = [];
    }
    const group = createAdvancedGroup({});
    parentNode.children.push(group);
    return group;
  }

  function addAdvancedAggregate(alert, parentId) {
    const root = ensureAdvancedRoot(alert);
    if (!root) {
      return null;
    }
    let parentNode = root;
    if (parentId && parentId !== root.id) {
      const found = findAdvancedNodeById(alert, parentId);
      if (!found || !found.node || found.node.type !== "group") {
        return null;
      }
      parentNode = found.node;
    }
    if (!Array.isArray(parentNode.children)) {
      parentNode.children = [];
    }
    const aggregate = createAdvancedAggregate({});
    parentNode.children.push(aggregate);
    return aggregate;
  }

  function ensureAdvancedAggregateCriteria(alert, aggregateId) {
    const found = findAdvancedNodeById(alert, aggregateId);
    if (!found || !found.node || found.node.type !== "aggregate") {
      return null;
    }
    if (!found.node.criteria) {
      found.node.criteria = createAdvancedGroup({});
    }
    return found.node.criteria;
  }

  function removeAdvancedNode(alert, nodeId) {
    const root = ensureAdvancedRoot(alert);
    if (!root || !nodeId || root.id === nodeId) {
      return false;
    }
    let removed = false;
    visitAdvancedNodes(root, (node, parent, meta) => {
      if (!node || node.id !== nodeId || !parent || !meta) {
        return false;
      }
      if (meta.key === "children" && Array.isArray(parent.children)) {
        parent.children.splice(meta.index, 1);
        removed = true;
      }
      if (meta.key === "criteria") {
        parent.criteria = null;
        removed = true;
      }
      return removed;
    });
    return removed;
  }

  function cloneAlertState(alert) {
    const filters = Array.isArray(alert?.filters)
      ? alert.filters.map((filter) => createAlertFilter(filter))
      : [createAlertFilter()];
    if (!filters.length) {
      filters.push(createAlertFilter());
    }
    const mode =
      typeof alert?.mode === "string" && alert.mode === ADVANCED_ALERT_MODES.ADVANCED
        ? ADVANCED_ALERT_MODES.ADVANCED
        : ADVANCED_ALERT_MODES.SIMPLE;
    const advancedRoot = cloneAdvancedNode(alert?.advanced) || createDefaultAdvancedRoot();
    ensureAdvancedRoot({ advanced: advancedRoot });
    return {
      id: typeof alert?.id === "string" && alert.id ? alert.id : generateAlertId(),
      label: typeof alert?.label === "string" ? alert.label : "",
      mode,
      filters,
      advanced: advancedRoot,
    };
  }

  function normalizeRecordAlertDetails(details, fallbackAlerts) {
    if (Array.isArray(details) && details.length) {
      return details;
    }
    if (!Array.isArray(fallbackAlerts)) {
      return [];
    }
    const normalized = [];
    fallbackAlerts.forEach((alert) => {
      if (!alert || typeof alert !== "object") {
        return;
      }
      const matches = Array.isArray(alert.matches) ? alert.matches : [];
      matches.forEach((match) => {
        if (!match || typeof match !== "object") {
          return;
        }
        normalized.push({
          id: alert.id,
          label: alert.label,
          object: match.object,
          recordId: match.recordId,
          fields: Array.isArray(match.fields) ? match.fields : [],
        });
      });
    });
    return normalized;
  }

  function getAlertOperatorLabel(operator) {
    const key = `account_explorer.setup.alerts.operators.${operator}`;
    const translated = translateKey(key);
    return translated !== key ? translated : operator;
  }

  function formatFieldCondition(field) {
    if (!field || typeof field !== "object") {
      return "";
    }
    const parts = [];
    if (field.name) {
      parts.push(field.name);
    }
    parts.push(getAlertOperatorLabel(field.operator));
    if (field.filterValue) {
      parts.push(field.filterValue);
    }
    if (field.actualValue) {
      parts.push(`[${field.actualValue}]`);
    }
    if (field.message) {
      parts.push(field.message);
    }
    return parts.filter(Boolean).join(" ");
  }

  function formatRecordAlertDetails(details) {
    if (!Array.isArray(details) || !details.length) {
      return "";
    }
    const lines = [];
    details.forEach((detail) => {
      if (!detail || typeof detail !== "object") {
        return;
      }
      const label = detail.label || detail.id || "";
      const objectLabel = detail.object ? getObjectLabel(detail.object) : "";
      const recordPart = detail.recordId ? ` ${detail.recordId}` : "";
      const fieldDescriptions = Array.isArray(detail.fields)
        ? detail.fields.map((field) => formatFieldCondition(field)).filter(Boolean)
        : [];
      let line = label || "";
      const context = `${objectLabel}${recordPart}`.trim();
      if (context) {
        line = line ? `${line} — ${context}` : context;
      }
      if (fieldDescriptions.length) {
        const description = fieldDescriptions.join("; ");
        line = line ? `${line}: ${description}` : description;
      }
      if (detail.message) {
        line = line ? `${line} — ${detail.message}` : detail.message;
      }
      if (line) {
        lines.push(line);
      }
    });
    return lines.join("\n");
  }

  function formatFieldAlertDetails(details, { objectKey, fieldName } = {}) {
    if (!Array.isArray(details) || !details.length) {
      return "";
    }
    const objectLabel = objectKey ? getObjectLabel(objectKey) : "";
    const lines = [];
    details.forEach((detail) => {
      if (!detail || typeof detail !== "object") {
        return;
      }
      const label = detail.label || detail.id || "";
      const operatorLabel = getAlertOperatorLabel(detail.operator);
      const contextParts = [];
      if (objectLabel) {
        contextParts.push(objectLabel);
      }
      if (fieldName) {
        contextParts.push(fieldName);
      }
      const context = contextParts.join(".");
      const valueParts = [operatorLabel];
      if (detail.filterValue) {
        valueParts.push(detail.filterValue);
      }
      if (detail.actualValue) {
        valueParts.push(`[${detail.actualValue}]`);
      }
      const valueText = valueParts.filter(Boolean).join(" ");
      let line = label || "";
      if (context) {
        line = line ? `${line} — ${context}` : context;
      }
      if (valueText) {
        line = line ? `${line}: ${valueText}` : valueText;
      }
      if (line) {
        lines.push(line);
      }
    });
    return lines.join("\n");
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
    const setupAlertList = document.getElementById("account-explorer-setup-alert-list");
    const setupAlertAddButton = document.getElementById("account-explorer-setup-alert-add");

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
        : { fields: {}, objects: [], alerts: [], viewMode: DEFAULT_VIEW_MODE };
    if (!VIEW_MODES.has(configState.viewMode)) {
      configState.viewMode = DEFAULT_VIEW_MODE;
    }
    if (!Array.isArray(configState.alerts)) {
      configState.alerts = [];
    }
    if (!configState.contactPointSources || typeof configState.contactPointSources !== "object") {
      configState.contactPointSources = {};
    }
    let currentViewMode = configState.viewMode || DEFAULT_VIEW_MODE;

    let setupObjectsState = [];
    let setupViewMode = currentViewMode;
    let setupAlertsState = [];
    const setupFieldInputs = new Map();
    const setupFieldDatalists = new Map();
    const setupContactPointSourceInputs = new Map();
    const fieldCache = new Map();

    function isObjectVisible(key) {
      const definition = objectDefinitions.find((item) => item.key === key);
      if (!definition) {
        return true;
      }
      return !definition.hidden;
    }

    function getVisibleObjects() {
      return objectDefinitions.filter((item) => !item.hidden);
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

    function populateDatalistElement(datalist, fields) {
      if (!datalist) {
        return;
      }
      datalist.innerHTML = "";
      (fields || []).forEach((field) => {
        if (!field) {
          return;
        }
        const option = document.createElement("option");
        option.value = field.name || "";
        if (field.label) {
          option.label = `${field.label} (${field.name})`;
        }
        datalist.appendChild(option);
      });
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

    function renderFieldList(container, fields, { objectKey } = {}) {
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
        const fieldAlertDetails = Array.isArray(field.alertDetails)
          ? field.alertDetails
          : [];
        if (fieldAlertDetails.length) {
          const tooltip = formatFieldAlertDetails(fieldAlertDetails, {
            objectKey,
            fieldName: field.name,
          });
          if (tooltip) {
            dt.title = tooltip;
            dd.title = tooltip;
          }
          dt.classList.add("account-alert-text", "text-danger");
          dd.classList.add("account-alert-text", "text-danger");
        }
        container.appendChild(dt);
        container.appendChild(dd);
      });
    }

    function renderTreeFieldList(container, fields, { objectKey } = {}) {
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
        const fieldAlertDetails = Array.isArray(field.alertDetails)
          ? field.alertDetails
          : [];
        if (fieldAlertDetails.length) {
          const tooltip = formatFieldAlertDetails(fieldAlertDetails, {
            objectKey,
            fieldName: field.name,
          });
          if (tooltip) {
            row.title = tooltip;
          }
          row.classList.add("account-alert-field");
          nameEl.classList.add("account-alert-text", "text-danger");
          valueEl.classList.add("account-alert-text", "text-danger");
        }
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
            const card = document.createElement("div");
            card.className = "border rounded p-2 mb-2";
            const badge = document.createElement("div");
            badge.className = "badge bg-light text-secondary mb-2";
            badge.textContent = record.id || translateKey("account_explorer.results.no_id");
            card.appendChild(badge);
            const dl = document.createElement("dl");
            dl.className = "row mb-0 small";
            renderFieldList(dl, record.fields || [], { objectKey: key });
            const recordAlertDetails = Array.isArray(record.alertDetails)
              ? record.alertDetails
              : [];
            if (recordAlertDetails.length) {
              const tooltip = formatRecordAlertDetails(recordAlertDetails);
              if (tooltip) {
                card.title = tooltip;
              }
              card.classList.add("account-alert-card");
              badge.classList.add("bg-danger-subtle", "text-danger");
            }
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
      let badge = null;
      if (recordId) {
        badge = document.createElement("span");
        badge.className = "badge bg-light text-secondary";
        badge.textContent = recordId;
        header.appendChild(badge);
      }
      card.appendChild(header);
      const dl = document.createElement("dl");
      dl.className = "row mb-0 small";
      renderFieldList(dl, record.fields || [], { objectKey });
      const recordAlertDetails = Array.isArray(record.alertDetails)
        ? record.alertDetails
        : [];
      if (recordAlertDetails.length) {
        const tooltip = formatRecordAlertDetails(recordAlertDetails);
        if (tooltip) {
          card.title = tooltip;
        }
        card.classList.add("account-alert-card");
        title.classList.add("account-alert-text", "text-danger");
        if (badge) {
          badge.classList.add("bg-danger-subtle", "text-danger");
        }
      }
      card.appendChild(dl);
      return card;
    }

    function buildLinkMap(records, candidates, options = {}) {
      const map = new Map();
      if (!Array.isArray(records)) {
        return map;
      }
      const requireSource =
        options && typeof options.requireSource === "string"
          ? options.requireSource
          : null;
      records.forEach((record) => {
        if (requireSource) {
          const sources = Array.isArray(record?.linkSources)
            ? record.linkSources
                .map((value) => (typeof value === "string" ? value : null))
                .filter(Boolean)
            : [];
          if (!sources.includes(requireSource)) {
            return;
          }
        }
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
      if (
        (objectKey === "ContactPointPhone" || objectKey === "ContactPointEmail") &&
        Array.isArray(record.linkSources)
      ) {
        const tags = document.createElement("div");
        tags.className = "account-tree-node__tags";
        record.linkSources.forEach((source) => {
          if (typeof source !== "string" || !source) {
            return;
          }
          const labelKey = CONTACT_POINT_SOURCE_LABEL_KEYS[source];
          const text = labelKey ? translateKey(labelKey) : source;
          if (!text) {
            return;
          }
          const tag = document.createElement("span");
          tag.className = "account-tree-node__tag";
          tag.textContent = text;
          tags.appendChild(tag);
        });
        if (tags.childElementCount) {
          node.appendChild(tags);
        }
      }
      if (showFields) {
        const fieldsContainer = document.createElement("div");
        fieldsContainer.className = "account-tree-node__fields";
        renderTreeFieldList(fieldsContainer, record.fields || [], { objectKey });
        node.appendChild(fieldsContainer);
      }
      const recordAlertDetails = Array.isArray(record.alertDetails)
        ? record.alertDetails
        : [];
      if (recordAlertDetails.length) {
        const tooltip = formatRecordAlertDetails(recordAlertDetails);
        if (tooltip) {
          node.title = tooltip;
        }
        node.classList.add("account-tree-node--alert");
        title.classList.add("account-alert-text", "text-danger");
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
            {
              key: "ContactPointPhone",
              records: context.contactPointPhonesByIndividual,
              source: "individual",
            },
            {
              key: "ContactPointEmail",
              records: context.contactPointEmailsByIndividual,
              source: "individual",
            },
          ]
        : [
            {
              key: "ContactPointPhone",
              records: context.contactPointPhonesByContact,
              source: "contact",
            },
            {
              key: "ContactPointEmail",
              records: context.contactPointEmailsByContact,
              source: "contact",
            },
          ];
      const branches = [];
      mapping.forEach((entry) => {
        if (!context.isObjectVisible(entry.key)) {
          return;
        }
        if (
          typeof context.isContactPointSourceEnabled === "function" &&
          !context.isContactPointSourceEnabled(entry.key, entry.source)
        ) {
          return;
        }
        const records =
          entry.records && typeof entry.records.get === "function"
            ? entry.records.get(recordId) || []
            : [];
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
      const accountAlertDetails = normalizeRecordAlertDetails(
        Array.isArray(account.alertDetails) ? account.alertDetails : [],
        Array.isArray(account.alerts) ? account.alerts : []
      );
      if (accountAlertDetails.length) {
        const tooltip = formatRecordAlertDetails(accountAlertDetails);
        if (tooltip) {
          header.title = tooltip;
        }
        header.classList.add("account-alert-card");
        title.classList.add("account-alert-text", "text-danger");
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
      const contactPointSources = new Map();
      CONTACT_POINT_OBJECTS.forEach((objectKey) => {
        contactPointSources.set(
          objectKey,
          resolveContactPointSourceConfig(configState.contactPointSources, objectKey)
        );
      });
      const phoneSourceConfig = contactPointSources.get("ContactPointPhone");
      const emailSourceConfig = contactPointSources.get("ContactPointEmail");
      const contactPointPhonesByContact = phoneSourceConfig?.contact
        ? buildLinkMap(phones, CONTACT_LINK_FIELDS, { requireSource: "contact" })
        : new Map();
      const contactPointEmailsByContact = emailSourceConfig?.contact
        ? buildLinkMap(emails, CONTACT_LINK_FIELDS, { requireSource: "contact" })
        : new Map();
      const contactPointPhonesByIndividual = phoneSourceConfig?.individual
        ? buildLinkMap(phones, INDIVIDUAL_LINK_FIELDS, { requireSource: "individual" })
        : new Map();
      const contactPointEmailsByIndividual = emailSourceConfig?.individual
        ? buildLinkMap(emails, INDIVIDUAL_LINK_FIELDS, { requireSource: "individual" })
        : new Map();

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
        contactPointSources,
        isContactPointSourceEnabled(objectKey, source) {
          const entry = contactPointSources.get(objectKey);
          if (!entry || typeof entry !== "object") {
            return true;
          }
          if (typeof source === "string" && Object.prototype.hasOwnProperty.call(entry, source)) {
            return Boolean(entry[source]);
          }
          return true;
        },
        visibleDefinitions,
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
        accountEmpty.classList.remove("d-none");
        if (accountHeading) {
          accountHeading.removeAttribute("title");
          accountHeading.classList.remove("account-alert-text", "text-danger");
        }
        return;
      }
      accountEmpty.classList.add("d-none");
      accountDetails.classList.remove("d-none");
      accountHeading.textContent = getAccountDisplayName(account) || account.id;
      const accountAlertDetails = normalizeRecordAlertDetails(
        Array.isArray(account.alertDetails) ? account.alertDetails : [],
        Array.isArray(account.alerts) ? account.alerts : []
      );
      if (accountAlertDetails.length) {
        const tooltip = formatRecordAlertDetails(accountAlertDetails);
        if (tooltip) {
          accountHeading.title = tooltip;
        }
        accountHeading.classList.add("account-alert-text", "text-danger");
      } else {
        accountHeading.removeAttribute("title");
        accountHeading.classList.remove("account-alert-text", "text-danger");
      }
      renderFieldList(accountFields, account.fields || [], { objectKey: "Account" });
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
      accountList.innerHTML = "";
      accounts.forEach((account) => {
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
        const accountAlertDetails = normalizeRecordAlertDetails(
          Array.isArray(account.alertDetails) ? account.alertDetails : [],
          Array.isArray(account.alerts) ? account.alerts : []
        );
        if (accountAlertDetails.length) {
          const tooltip = formatRecordAlertDetails(accountAlertDetails);
          if (tooltip) {
            button.title = tooltip;
          }
          button.classList.add("account-alert-item");
          title.classList.add("account-alert-text", "text-danger");
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

    function gatherContactPointSources() {
      const payload = {};
      setupContactPointSourceInputs.forEach((inputs, objectKey) => {
        if (!inputs) {
          return;
        }
        const entry = {};
        if (inputs.contact) {
          entry.contact = Boolean(inputs.contact.checked);
        }
        if (inputs.individual) {
          entry.individual = Boolean(inputs.individual.checked);
        }
        payload[objectKey] = entry;
      });
      return payload;
    }

    function loadFieldsForObject(objectKey) {
      if (!setupOrgSelect || !setupOrgSelect.value) {
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
        });
    }

    function ensureObjectFieldsLoaded(objectKey) {
      loadFieldsForObject(objectKey)
        .then((fields) => {
          fillDatalist(objectKey, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            showToast(translateKey("frontend.account_explorer.no_org"), "warning");
          } else {
            showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
          }
        });
    }

    function fillDatalist(objectKey, fields) {
      const datalist = setupFieldDatalists.get(objectKey);
      if (!datalist) {
        return;
      }
      populateDatalistElement(datalist, fields);
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
      setupContactPointSourceInputs.clear();
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
        if (CONTACT_POINT_OBJECTS.has(objectKey)) {
          const optionsWrapper = document.createElement("div");
          optionsWrapper.className = "mt-3";
          const optionsTitle = document.createElement("div");
          optionsTitle.className = "text-muted text-uppercase small fw-semibold mb-2";
          optionsTitle.textContent = translateKey(
            "account_explorer.setup.contact_points.title"
          );
          optionsWrapper.appendChild(optionsTitle);
          const optionsDescription = document.createElement("p");
          optionsDescription.className = "small text-muted mb-2";
          optionsDescription.textContent = translateKey(
            "account_explorer.setup.contact_points.description"
          );
          optionsWrapper.appendChild(optionsDescription);
          const switchesContainer = document.createElement("div");
          switchesContainer.className = "d-flex flex-wrap gap-3";

          const contactSwitch = document.createElement("div");
          contactSwitch.className = "form-check form-switch";
          const contactInput = document.createElement("input");
          contactInput.className = "form-check-input";
          contactInput.type = "checkbox";
          contactInput.id = `account-explorer-contact-source-${objectKey}-contact`;
          contactInput.setAttribute("data-object", objectKey);
          contactInput.setAttribute("data-source", "contact");
          const contactLabel = document.createElement("label");
          contactLabel.className = "form-check-label";
          contactLabel.setAttribute("for", contactInput.id);
          contactLabel.textContent = translateKey(
            "account_explorer.setup.contact_points.options.contact"
          );
          contactSwitch.appendChild(contactInput);
          contactSwitch.appendChild(contactLabel);
          switchesContainer.appendChild(contactSwitch);

          const individualSwitch = document.createElement("div");
          individualSwitch.className = "form-check form-switch";
          const individualInput = document.createElement("input");
          individualInput.className = "form-check-input";
          individualInput.type = "checkbox";
          individualInput.id = `account-explorer-contact-source-${objectKey}-individual`;
          individualInput.setAttribute("data-object", objectKey);
          individualInput.setAttribute("data-source", "individual");
          const individualLabel = document.createElement("label");
          individualLabel.className = "form-check-label";
          individualLabel.setAttribute("for", individualInput.id);
          individualLabel.textContent = translateKey(
            "account_explorer.setup.contact_points.options.individual"
          );
          individualSwitch.appendChild(individualInput);
          individualSwitch.appendChild(individualLabel);
          switchesContainer.appendChild(individualSwitch);

          optionsWrapper.appendChild(switchesContainer);
          body.appendChild(optionsWrapper);
          setupContactPointSourceInputs.set(objectKey, {
            contact: contactInput,
            individual: individualInput,
          });
        }
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
      setupContactPointSourceInputs.forEach((inputs, objectKey) => {
        const config = resolveContactPointSourceConfig(
          configState.contactPointSources,
          objectKey
        );
        if (inputs.contact) {
          inputs.contact.checked = Boolean(config.contact);
        }
        if (inputs.individual) {
          inputs.individual.checked = Boolean(config.individual);
        }
      });
    }

    function findAlertById(alertId) {
      return setupAlertsState.find((entry) => entry && entry.id === alertId) || null;
    }

    function findAlertFilter(alert, filterId) {
      if (!alert || !Array.isArray(alert.filters)) {
        return null;
      }
      return alert.filters.find((filter) => filter && filter.id === filterId) || null;
    }

    function updateAlertFilterValueState(alertId, filterId) {
      if (!setupAlertList) {
        return;
      }
      const selector = `input[data-role="alert-value"][data-alert-id="${alertId}"][data-filter-id="${filterId}"]`;
      const input = setupAlertList.querySelector(selector);
      const alert = findAlertById(alertId);
      const filter = findAlertFilter(alert, filterId);
      if (!input || !filter) {
        return;
      }
      const needsValue = operatorRequiresValue(filter.operator);
      input.disabled = !needsValue;
      if (!needsValue) {
        input.value = "";
        filter.value = "";
      }
    }

    function updateAdvancedConditionValueState(alertId, nodeId) {
      if (!setupAlertList) {
        return;
      }
      const selector = `input[data-role="advanced-value"][data-alert-id="${alertId}"][data-node-id="${nodeId}"]`;
      const input = setupAlertList.querySelector(selector);
      const alert = findAlertById(alertId);
      if (!input || !alert) {
        return;
      }
      const found = findAdvancedNodeById(alert, nodeId);
      if (!found || !found.node || found.node.type !== "condition") {
        return;
      }
      const operator = normalizeOperator(found.node.operator);
      const needsValue = operatorRequiresValue(operator);
      input.disabled = !needsValue;
      if (!needsValue) {
        input.value = "";
        found.node.value = "";
      }
    }

    function loadAlertFieldSuggestions(alertId, filterId) {
      const alert = findAlertById(alertId);
      const filter = findAlertFilter(alert, filterId);
      if (!filter || !filter.object) {
        return;
      }
      loadFieldsForObject(filter.object)
        .then((fields) => {
          const datalistId = `account-explorer-alert-datalist-${alertId}-${filterId}`;
          const datalist = document.getElementById(datalistId);
          populateDatalistElement(datalist, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            showToast(translateKey("frontend.account_explorer.no_org"), "warning");
          } else {
            showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
          }
        });
    }

    function renderAdvancedBuilder(alert, container, { alertObjects }) {
      container.innerHTML = "";
      const root = ensureAdvancedRoot(alert);
      if (!root) {
        return;
      }
      const intro = document.createElement("p");
      intro.className = "small text-muted mb-2";
      intro.innerHTML = translateKey("account_explorer.setup.alerts.advanced.builder_intro");
      container.appendChild(intro);
      const rootElement = renderAdvancedNode(alert, root, {
        alertObjects,
        isRoot: true,
        allowScope: true,
        allowAggregate: true,
        parentScope: null,
      });
      if (rootElement) {
        container.appendChild(rootElement);
      } else {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.setup.alerts.advanced.empty");
        container.appendChild(empty);
      }
    }

    function renderAdvancedNode(alert, node, options = {}) {
      if (!node || typeof node !== "object") {
        return null;
      }
      if (node.type === "group") {
        return renderAdvancedGroupNode(alert, node, options);
      }
      if (node.type === "scope") {
        return renderAdvancedScopeNode(alert, node, options);
      }
      if (node.type === "condition") {
        return renderAdvancedConditionNode(alert, node, options);
      }
      if (node.type === "aggregate") {
        return renderAdvancedAggregateNode(alert, node, options);
      }
      return null;
    }

    function renderAdvancedGroupNode(alert, node, options = {}) {
      const element = document.createElement("div");
      element.className = "advanced-node advanced-node-group";
      element.dataset.nodeId = node.id;
      element.dataset.alertId = alert.id;

      const header = document.createElement("div");
      header.className = "advanced-node-header d-flex flex-wrap align-items-center gap-2";
      const title = document.createElement("span");
      title.className = "fw-semibold small";
      title.textContent = options.isRoot
        ? translateKey("account_explorer.setup.alerts.advanced.group_root_label")
        : translateKey("account_explorer.setup.alerts.advanced.group_label");
      header.appendChild(title);

      const logicSelect = document.createElement("select");
      logicSelect.className = "form-select form-select-sm w-auto";
      logicSelect.dataset.alertId = alert.id;
      logicSelect.dataset.nodeId = node.id;
      logicSelect.dataset.role = "advanced-logic";
      ADVANCED_GROUP_OPTIONS.forEach((option) => {
        const logicOption = document.createElement("option");
        logicOption.value = option.value;
        logicOption.textContent = translateKey(option.labelKey);
        logicSelect.appendChild(logicOption);
      });
      logicSelect.value = normalizeAdvancedGroupLogic(node.logic);
      header.appendChild(logicSelect);

      if (!options.isRoot) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.dataset.action = "remove-advanced-node";
        removeButton.dataset.alertId = alert.id;
        removeButton.dataset.nodeId = node.id;
        removeButton.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.remove_group"
        );
        header.appendChild(removeButton);
      }

      element.appendChild(header);

      const body = document.createElement("div");
      body.className = "advanced-node-body";
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length) {
        children.forEach((child) => {
          const childElement = renderAdvancedNode(alert, child, {
            alertObjects: options.alertObjects,
            isRoot: false,
            allowScope: options.parentScope ? false : options.allowScope,
            allowAggregate: options.parentScope ? false : options.allowAggregate,
            parentScope: options.parentScope || null,
          });
          if (childElement) {
            body.appendChild(childElement);
          }
        });
      } else {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.group_empty"
        );
        body.appendChild(empty);
      }
      element.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "advanced-node-actions d-flex flex-wrap gap-2 mt-2";
      if (options.allowScope !== false && !options.parentScope) {
        const scopeButton = document.createElement("button");
        scopeButton.type = "button";
        scopeButton.className = "btn btn-outline-primary btn-sm";
        scopeButton.dataset.action = "add-advanced-scope";
        scopeButton.dataset.alertId = alert.id;
        scopeButton.dataset.parentId = node.id;
        scopeButton.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.add_scope"
        );
        actions.appendChild(scopeButton);
      }

      const conditionButton = document.createElement("button");
      conditionButton.type = "button";
      conditionButton.className = "btn btn-outline-primary btn-sm";
      conditionButton.dataset.action = "add-advanced-condition";
      conditionButton.dataset.alertId = alert.id;
      conditionButton.dataset.parentId = node.id;
      conditionButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.add_condition"
      );
      actions.appendChild(conditionButton);

      const groupButton = document.createElement("button");
      groupButton.type = "button";
      groupButton.className = "btn btn-outline-primary btn-sm";
      groupButton.dataset.action = "add-advanced-group";
      groupButton.dataset.alertId = alert.id;
      groupButton.dataset.parentId = node.id;
      groupButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.add_group"
      );
      actions.appendChild(groupButton);

      if (options.allowAggregate !== false && !options.parentScope) {
        const aggregateButton = document.createElement("button");
        aggregateButton.type = "button";
        aggregateButton.className = "btn btn-outline-primary btn-sm";
        aggregateButton.dataset.action = "add-advanced-aggregate";
        aggregateButton.dataset.alertId = alert.id;
        aggregateButton.dataset.parentId = node.id;
        aggregateButton.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.add_aggregate"
        );
        actions.appendChild(aggregateButton);
      }

      element.appendChild(actions);
      return element;
    }

    function renderAdvancedScopeNode(alert, node, options = {}) {
      const element = document.createElement("div");
      element.className = "advanced-node advanced-node-scope";
      element.dataset.nodeId = node.id;
      element.dataset.alertId = alert.id;

      const header = document.createElement("div");
      header.className = "advanced-node-header d-flex flex-wrap align-items-center gap-2";

      const scopeLabel = document.createElement("span");
      scopeLabel.className = "fw-semibold small";
      scopeLabel.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.scope_label"
      );
      header.appendChild(scopeLabel);

      const objectSelect = document.createElement("select");
      objectSelect.className = "form-select form-select-sm w-auto";
      objectSelect.dataset.alertId = alert.id;
      objectSelect.dataset.nodeId = node.id;
      objectSelect.dataset.role = "advanced-scope-object";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = translateKey(
        "account_explorer.setup.alerts.object_placeholder"
      );
      objectSelect.appendChild(placeholder);
      alertObjects.forEach((definition) => {
        if (!definition) {
          return;
        }
        const option = document.createElement("option");
        option.value = definition.key;
        option.textContent = definition.label;
        objectSelect.appendChild(option);
      });
      objectSelect.value = typeof node.object === "string" ? node.object : "";
      header.appendChild(objectSelect);

      const matchSelect = document.createElement("select");
      matchSelect.className = "form-select form-select-sm w-auto";
      matchSelect.dataset.alertId = alert.id;
      matchSelect.dataset.nodeId = node.id;
      matchSelect.dataset.role = "advanced-scope-match";
      ADVANCED_SCOPE_MATCHES.forEach((option) => {
        const matchOption = document.createElement("option");
        matchOption.value = option.value;
        matchOption.textContent = translateKey(option.labelKey);
        matchSelect.appendChild(matchOption);
      });
      matchSelect.value = normalizeAdvancedScopeMatch(node.match);
      header.appendChild(matchSelect);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-outline-danger btn-sm";
      removeButton.dataset.action = "remove-advanced-node";
      removeButton.dataset.alertId = alert.id;
      removeButton.dataset.nodeId = node.id;
      removeButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.remove_scope"
      );
      header.appendChild(removeButton);

      element.appendChild(header);

      const body = document.createElement("div");
      body.className = "advanced-node-body";
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length) {
        children.forEach((child) => {
          const childElement = renderAdvancedNode(alert, child, {
            alertObjects: options.alertObjects,
            isRoot: false,
            allowScope: false,
            allowAggregate: false,
            parentScope: node.object || "",
          });
          if (childElement) {
            body.appendChild(childElement);
          }
        });
      } else {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.scope_empty"
        );
        body.appendChild(empty);
      }
      element.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "advanced-node-actions d-flex flex-wrap gap-2 mt-2";

      const conditionButton = document.createElement("button");
      conditionButton.type = "button";
      conditionButton.className = "btn btn-outline-primary btn-sm";
      conditionButton.dataset.action = "add-advanced-condition";
      conditionButton.dataset.alertId = alert.id;
      conditionButton.dataset.parentId = node.id;
      conditionButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.add_condition"
      );
      actions.appendChild(conditionButton);

      const groupButton = document.createElement("button");
      groupButton.type = "button";
      groupButton.className = "btn btn-outline-primary btn-sm";
      groupButton.dataset.action = "add-advanced-group";
      groupButton.dataset.alertId = alert.id;
      groupButton.dataset.parentId = node.id;
      groupButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.add_group"
      );
      actions.appendChild(groupButton);

      element.appendChild(actions);
      return element;
    }

    function renderAdvancedConditionNode(alert, node, options = {}) {
      const element = document.createElement("div");
      element.className = "advanced-node advanced-node-condition";
      element.dataset.nodeId = node.id;
      element.dataset.alertId = alert.id;

      const header = document.createElement("div");
      header.className = "advanced-node-header d-flex flex-wrap align-items-center gap-2";
      const title = document.createElement("span");
      title.className = "fw-semibold small";
      title.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.condition_label"
      );
      header.appendChild(title);

      if (!options.parentScope) {
        const objectSelect = document.createElement("select");
        objectSelect.className = "form-select form-select-sm w-auto";
        objectSelect.dataset.alertId = alert.id;
        objectSelect.dataset.nodeId = node.id;
        objectSelect.dataset.role = "advanced-condition-object";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = translateKey(
          "account_explorer.setup.alerts.object_placeholder"
        );
        objectSelect.appendChild(placeholder);
        (options.alertObjects || []).forEach((definition) => {
          if (!definition) {
            return;
          }
          const option = document.createElement("option");
          option.value = definition.key;
          option.textContent = definition.label;
          objectSelect.appendChild(option);
        });
        objectSelect.value = typeof node.object === "string" ? node.object : "";
        header.appendChild(objectSelect);
      } else {
        const scopeTag = document.createElement("span");
        scopeTag.className = "badge bg-secondary text-wrap";
        scopeTag.textContent = options.parentScope;
        header.appendChild(scopeTag);
      }

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-outline-danger btn-sm";
      removeButton.dataset.action = "remove-advanced-node";
      removeButton.dataset.alertId = alert.id;
      removeButton.dataset.nodeId = node.id;
      removeButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.remove_condition"
      );
      header.appendChild(removeButton);

      element.appendChild(header);

      const body = document.createElement("div");
      body.className = "advanced-node-body";
      const row = document.createElement("div");
      row.className = "row g-2 align-items-end";

      const fieldCol = document.createElement("div");
      fieldCol.className = "col-md-4";
      const fieldLabel = document.createElement("label");
      fieldLabel.className = "form-label small";
      fieldLabel.textContent = translateKey(
        "account_explorer.setup.alerts.field"
      );
      fieldLabel.setAttribute(
        "for",
        `account-explorer-advanced-field-${alert.id}-${node.id}`
      );
      fieldCol.appendChild(fieldLabel);
      const fieldInput = document.createElement("input");
      fieldInput.type = "text";
      fieldInput.className = "form-control form-control-sm";
      fieldInput.id = `account-explorer-advanced-field-${alert.id}-${node.id}`;
      fieldInput.value = node.field || "";
      fieldInput.dataset.alertId = alert.id;
      fieldInput.dataset.nodeId = node.id;
      fieldInput.dataset.role = "advanced-field";
      const objectForField = options.parentScope || node.object || "";
      if (objectForField) {
        fieldInput.dataset.object = objectForField;
      }
      fieldInput.setAttribute(
        "list",
        `account-explorer-advanced-datalist-${alert.id}-${node.id}`
      );
      const fieldDatalist = document.createElement("datalist");
      fieldDatalist.id = `account-explorer-advanced-datalist-${alert.id}-${node.id}`;
      fieldCol.appendChild(fieldInput);
      fieldCol.appendChild(fieldDatalist);
      row.appendChild(fieldCol);

      const operatorCol = document.createElement("div");
      operatorCol.className = "col-md-3";
      const operatorLabel = document.createElement("label");
      operatorLabel.className = "form-label small";
      operatorLabel.textContent = translateKey(
        "account_explorer.setup.alerts.operator"
      );
      operatorLabel.setAttribute(
        "for",
        `account-explorer-advanced-operator-${alert.id}-${node.id}`
      );
      operatorCol.appendChild(operatorLabel);
      const operatorSelect = document.createElement("select");
      operatorSelect.className = "form-select form-select-sm";
      operatorSelect.id = `account-explorer-advanced-operator-${alert.id}-${node.id}`;
      operatorSelect.dataset.alertId = alert.id;
      operatorSelect.dataset.nodeId = node.id;
      operatorSelect.dataset.role = "advanced-condition-operator";
      ALERT_OPERATORS.forEach((operator) => {
        const option = document.createElement("option");
        option.value = operator.value;
        option.textContent = translateKey(operator.labelKey);
        operatorSelect.appendChild(option);
      });
      operatorSelect.value = normalizeOperator(node.operator);
      operatorCol.appendChild(operatorSelect);
      row.appendChild(operatorCol);

      const valueCol = document.createElement("div");
      valueCol.className = "col-md-3";
      const valueLabel = document.createElement("label");
      valueLabel.className = "form-label small";
      valueLabel.textContent = translateKey(
        "account_explorer.setup.alerts.value"
      );
      valueLabel.setAttribute(
        "for",
        `account-explorer-advanced-value-${alert.id}-${node.id}`
      );
      valueCol.appendChild(valueLabel);
      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "form-control form-control-sm";
      valueInput.id = `account-explorer-advanced-value-${alert.id}-${node.id}`;
      valueInput.value = node.value || "";
      valueInput.placeholder = translateKey(
        "account_explorer.setup.alerts.value_placeholder"
      );
      valueInput.dataset.alertId = alert.id;
      valueInput.dataset.nodeId = node.id;
      valueInput.dataset.role = "advanced-value";
      valueCol.appendChild(valueInput);
      row.appendChild(valueCol);

      body.appendChild(row);
      element.appendChild(body);

      updateAdvancedConditionValueState(alert.id, node.id);
      return element;
    }

    function renderAdvancedAggregateNode(alert, node, options = {}) {
      const element = document.createElement("div");
      element.className = "advanced-node advanced-node-aggregate";
      element.dataset.nodeId = node.id;
      element.dataset.alertId = alert.id;

      const header = document.createElement("div");
      header.className = "advanced-node-header d-flex flex-wrap align-items-center gap-2";
      const title = document.createElement("span");
      title.className = "fw-semibold small";
      title.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.aggregate_label"
      );
      header.appendChild(title);

      const objectSelect = document.createElement("select");
      objectSelect.className = "form-select form-select-sm w-auto";
      objectSelect.dataset.alertId = alert.id;
      objectSelect.dataset.nodeId = node.id;
      objectSelect.dataset.role = "advanced-aggregate-object";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = translateKey(
        "account_explorer.setup.alerts.object_placeholder"
      );
      objectSelect.appendChild(placeholder);
      (options.alertObjects || []).forEach((definition) => {
        if (!definition) {
          return;
        }
        const option = document.createElement("option");
        option.value = definition.key;
        option.textContent = definition.label;
        objectSelect.appendChild(option);
      });
      objectSelect.value = typeof node.object === "string" ? node.object : "";
      header.appendChild(objectSelect);

      const operationSelect = document.createElement("select");
      operationSelect.className = "form-select form-select-sm w-auto";
      operationSelect.dataset.alertId = alert.id;
      operationSelect.dataset.nodeId = node.id;
      operationSelect.dataset.role = "advanced-aggregate-operation";
      ADVANCED_AGGREGATE_OPERATIONS.forEach((definition) => {
        const option = document.createElement("option");
        option.value = definition.value;
        option.textContent = translateKey(definition.labelKey);
        operationSelect.appendChild(option);
      });
      operationSelect.value = normalizeAdvancedAggregateOperation(node.operation);
      header.appendChild(operationSelect);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-outline-danger btn-sm";
      removeButton.dataset.action = "remove-advanced-node";
      removeButton.dataset.alertId = alert.id;
      removeButton.dataset.nodeId = node.id;
      removeButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.remove_aggregate"
      );
      header.appendChild(removeButton);

      element.appendChild(header);

      const description = document.createElement("p");
      description.className = "small text-muted mb-2";
      description.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.aggregate_description"
      );
      element.appendChild(description);

      const body = document.createElement("div");
      body.className = "advanced-node-body";
      const row = document.createElement("div");
      row.className = "row g-2";

      const fieldCol = document.createElement("div");
      fieldCol.className = "col-md-4";
      const fieldLabel = document.createElement("label");
      fieldLabel.className = "form-label small";
      fieldLabel.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.aggregate_field"
      );
      fieldLabel.setAttribute(
        "for",
        `account-explorer-advanced-aggregate-field-${alert.id}-${node.id}`
      );
      fieldCol.appendChild(fieldLabel);
      const fieldInput = document.createElement("input");
      fieldInput.type = "text";
      fieldInput.className = "form-control form-control-sm";
      fieldInput.id = `account-explorer-advanced-aggregate-field-${alert.id}-${node.id}`;
      fieldInput.value = node.field || "";
      fieldInput.dataset.alertId = alert.id;
      fieldInput.dataset.nodeId = node.id;
      fieldInput.dataset.role = "advanced-aggregate-field";
      if (node.object) {
        fieldInput.dataset.object = node.object;
      }
      fieldInput.setAttribute(
        "list",
        `account-explorer-advanced-aggregate-datalist-${alert.id}-${node.id}`
      );
      const fieldDatalist = document.createElement("datalist");
      fieldDatalist.id = `account-explorer-advanced-aggregate-datalist-${alert.id}-${node.id}`;
      fieldCol.appendChild(fieldInput);
      fieldCol.appendChild(fieldDatalist);
      row.appendChild(fieldCol);

      const minCountCol = document.createElement("div");
      minCountCol.className = "col-md-3";
      const minCountLabel = document.createElement("label");
      minCountLabel.className = "form-label small";
      minCountLabel.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.aggregate_min_count"
      );
      minCountLabel.setAttribute(
        "for",
        `account-explorer-advanced-aggregate-min-${alert.id}-${node.id}`
      );
      minCountCol.appendChild(minCountLabel);
      const minCountInput = document.createElement("input");
      minCountInput.type = "number";
      minCountInput.min = "2";
      minCountInput.step = "1";
      minCountInput.className = "form-control form-control-sm";
      minCountInput.id = `account-explorer-advanced-aggregate-min-${alert.id}-${node.id}`;
      minCountInput.value = String(node.minCount || 2);
      minCountInput.dataset.alertId = alert.id;
      minCountInput.dataset.nodeId = node.id;
      minCountInput.dataset.role = "advanced-aggregate-min-count";
      minCountCol.appendChild(minCountInput);
      row.appendChild(minCountCol);

      const distinctCol = document.createElement("div");
      distinctCol.className = "col-md-4";
      const distinctLabel = document.createElement("label");
      distinctLabel.className = "form-label small";
      distinctLabel.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.aggregate_distinct_field"
      );
      distinctLabel.setAttribute(
        "for",
        `account-explorer-advanced-aggregate-distinct-${alert.id}-${node.id}`
      );
      distinctCol.appendChild(distinctLabel);
      const distinctInput = document.createElement("input");
      distinctInput.type = "text";
      distinctInput.className = "form-control form-control-sm";
      distinctInput.id = `account-explorer-advanced-aggregate-distinct-${alert.id}-${node.id}`;
      distinctInput.value = node.distinctField || "";
      distinctInput.dataset.alertId = alert.id;
      distinctInput.dataset.nodeId = node.id;
      distinctInput.dataset.role = "advanced-aggregate-distinct";
      if (node.object) {
        distinctInput.dataset.object = node.object;
      }
      distinctInput.setAttribute(
        "list",
        `account-explorer-advanced-aggregate-distinct-datalist-${alert.id}-${node.id}`
      );
      const distinctDatalist = document.createElement("datalist");
      distinctDatalist.id = `account-explorer-advanced-aggregate-distinct-datalist-${alert.id}-${node.id}`;
      distinctCol.appendChild(distinctInput);
      distinctCol.appendChild(distinctDatalist);
      row.appendChild(distinctCol);

      body.appendChild(row);

      if (node.criteria) {
        const criteriaHeader = document.createElement("div");
        criteriaHeader.className = "small fw-semibold mt-3";
        criteriaHeader.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.aggregate_filters"
        );
        body.appendChild(criteriaHeader);
        const criteriaNode = renderAdvancedNode(alert, node.criteria, {
          alertObjects: options.alertObjects,
          isRoot: false,
          allowScope: false,
          allowAggregate: false,
          parentScope: node.object || "",
        });
        if (criteriaNode) {
          body.appendChild(criteriaNode);
        }
      } else {
        const addCriteriaButton = document.createElement("button");
        addCriteriaButton.type = "button";
        addCriteriaButton.className = "btn btn-outline-primary btn-sm mt-3";
        addCriteriaButton.dataset.action = "add-advanced-criteria";
        addCriteriaButton.dataset.alertId = alert.id;
        addCriteriaButton.dataset.nodeId = node.id;
        addCriteriaButton.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.aggregate_add_filter"
        );
        body.appendChild(addCriteriaButton);
      }

      element.appendChild(body);
      return element;
    }

    function renderSetupAlerts() {
      if (!setupAlertList) {
        return;
      }
      setupAlertList.innerHTML = "";
      if (!setupAlertsState.length) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = translateKey("account_explorer.setup.alerts.empty");
        setupAlertList.appendChild(empty);
        return;
      }
      const alertObjects = [
        { key: "Account", label: translateKey("account_explorer.results.account_label") },
        ...objectDefinitions,
      ];
      setupAlertsState.forEach((alert) => {
        const card = document.createElement("div");
        card.className = "border rounded p-3";
        card.dataset.alertId = alert.id;

        const header = document.createElement("div");
        header.className = "d-flex align-items-center justify-content-between gap-2 mb-3";
        const labelWrapper = document.createElement("div");
        labelWrapper.className = "flex-grow-1";
        const labelId = `account-explorer-alert-label-${alert.id}`;
        const labelEl = document.createElement("label");
        labelEl.className = "form-label small mb-1";
        labelEl.setAttribute("for", labelId);
        labelEl.textContent = translateKey("account_explorer.setup.alerts.label");
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.className = "form-control form-control-sm";
        labelInput.id = labelId;
        labelInput.value = alert.label || "";
        labelInput.dataset.alertId = alert.id;
        labelInput.dataset.role = "alert-label";
        labelWrapper.appendChild(labelEl);
        labelWrapper.appendChild(labelInput);
        header.appendChild(labelWrapper);

        const removeAlertButton = document.createElement("button");
        removeAlertButton.type = "button";
        removeAlertButton.className = "btn btn-outline-danger btn-sm";
        removeAlertButton.dataset.action = "delete-alert";
        removeAlertButton.dataset.alertId = alert.id;
        removeAlertButton.textContent = translateKey("account_explorer.setup.alerts.remove_alert");
        header.appendChild(removeAlertButton);
        card.appendChild(header);

        const modeRow = document.createElement("div");
        modeRow.className = "row g-2 align-items-end";
        const modeCol = document.createElement("div");
        modeCol.className = "col-sm-4 col-md-3";
        const modeLabel = document.createElement("label");
        modeLabel.className = "form-label small";
        const modeSelectId = `account-explorer-alert-mode-${alert.id}`;
        modeLabel.setAttribute("for", modeSelectId);
        modeLabel.textContent = translateKey("account_explorer.setup.alerts.mode.label");
        const modeSelect = document.createElement("select");
        modeSelect.className = "form-select form-select-sm";
        modeSelect.id = modeSelectId;
        modeSelect.dataset.alertId = alert.id;
        modeSelect.dataset.role = "alert-mode";
        const simpleOption = document.createElement("option");
        simpleOption.value = ADVANCED_ALERT_MODES.SIMPLE;
        simpleOption.textContent = translateKey("account_explorer.setup.alerts.mode.simple");
        const advancedOption = document.createElement("option");
        advancedOption.value = ADVANCED_ALERT_MODES.ADVANCED;
        advancedOption.textContent = translateKey("account_explorer.setup.alerts.mode.advanced");
        modeSelect.appendChild(simpleOption);
        modeSelect.appendChild(advancedOption);
        const currentMode =
          alert.mode === ADVANCED_ALERT_MODES.ADVANCED
            ? ADVANCED_ALERT_MODES.ADVANCED
            : ADVANCED_ALERT_MODES.SIMPLE;
        modeSelect.value = currentMode;
        modeCol.appendChild(modeLabel);
        modeCol.appendChild(modeSelect);
        modeRow.appendChild(modeCol);

        const modeHintCol = document.createElement("div");
        modeHintCol.className = "col";
        const modeHint = document.createElement("p");
        modeHint.className = "small text-muted mb-0";
        modeHint.innerHTML = translateKey("account_explorer.setup.alerts.mode_hint");
        modeHintCol.appendChild(modeHint);
        modeRow.appendChild(modeHintCol);
        card.appendChild(modeRow);

        if (currentMode === ADVANCED_ALERT_MODES.ADVANCED) {
          const advancedWrapper = document.createElement("div");
          advancedWrapper.className = "advanced-alert-wrapper mt-3";
          renderAdvancedBuilder(alert, advancedWrapper, { alertObjects });
          card.appendChild(advancedWrapper);
        } else {
          const filtersContainer = document.createElement("div");
          filtersContainer.className = "d-grid gap-2 mt-3";

          alert.filters.forEach((filter) => {
            const row = document.createElement("div");
            row.className = "row g-2 align-items-end";
            row.dataset.filterId = filter.id;

            const objectCol = document.createElement("div");
            objectCol.className = "col-md-3";
            const objectLabel = document.createElement("label");
            objectLabel.className = "form-label small";
            const objectSelectId = `account-explorer-alert-object-${alert.id}-${filter.id}`;
            objectLabel.setAttribute("for", objectSelectId);
            objectLabel.textContent = translateKey("account_explorer.setup.alerts.object");
            const objectSelect = document.createElement("select");
            objectSelect.className = "form-select form-select-sm";
            objectSelect.id = objectSelectId;
            objectSelect.dataset.alertId = alert.id;
            objectSelect.dataset.filterId = filter.id;
            objectSelect.dataset.role = "alert-object";
            const objectPlaceholder = document.createElement("option");
            objectPlaceholder.value = "";
            objectPlaceholder.textContent = translateKey(
              "account_explorer.setup.alerts.object_placeholder"
            );
            objectSelect.appendChild(objectPlaceholder);
            alertObjects.forEach((definition) => {
              if (!definition) {
                return;
              }
              const option = document.createElement("option");
              option.value = definition.key;
              option.textContent = definition.label;
              objectSelect.appendChild(option);
            });
            objectSelect.value = filter.object || "";
            objectCol.appendChild(objectLabel);
            objectCol.appendChild(objectSelect);
            row.appendChild(objectCol);

            const fieldCol = document.createElement("div");
            fieldCol.className = "col-md-3";
            const fieldLabel = document.createElement("label");
            fieldLabel.className = "form-label small";
            const fieldInputId = `account-explorer-alert-field-${alert.id}-${filter.id}`;
            fieldLabel.setAttribute("for", fieldInputId);
            fieldLabel.textContent = translateKey("account_explorer.setup.alerts.field");
            const fieldInput = document.createElement("input");
            fieldInput.type = "text";
            fieldInput.className = "form-control form-control-sm";
            fieldInput.id = fieldInputId;
            fieldInput.value = filter.field || "";
            fieldInput.dataset.alertId = alert.id;
            fieldInput.dataset.filterId = filter.id;
            fieldInput.dataset.role = "alert-field";
            const datalistId = `account-explorer-alert-datalist-${alert.id}-${filter.id}`;
            fieldInput.setAttribute("list", datalistId);
            fieldInput.addEventListener("focus", () =>
              loadAlertFieldSuggestions(alert.id, filter.id)
            );
            const fieldDatalist = document.createElement("datalist");
            fieldDatalist.id = datalistId;
            fieldCol.appendChild(fieldLabel);
            fieldCol.appendChild(fieldInput);
            fieldCol.appendChild(fieldDatalist);
            row.appendChild(fieldCol);

            const operatorCol = document.createElement("div");
            operatorCol.className = "col-md-3 col-sm-6";
            const operatorLabel = document.createElement("label");
            operatorLabel.className = "form-label small";
            const operatorSelectId = `account-explorer-alert-operator-${alert.id}-${filter.id}`;
            operatorLabel.setAttribute("for", operatorSelectId);
            operatorLabel.textContent = translateKey("account_explorer.setup.alerts.operator");
            const operatorSelect = document.createElement("select");
            operatorSelect.className = "form-select form-select-sm";
            operatorSelect.id = operatorSelectId;
            operatorSelect.dataset.alertId = alert.id;
            operatorSelect.dataset.filterId = filter.id;
            operatorSelect.dataset.role = "alert-operator";
            ALERT_OPERATORS.forEach((operator) => {
              const option = document.createElement("option");
              option.value = operator.value;
              option.textContent = translateKey(operator.labelKey);
              operatorSelect.appendChild(option);
            });
            operatorSelect.value = normalizeOperator(filter.operator);
            operatorCol.appendChild(operatorLabel);
            operatorCol.appendChild(operatorSelect);
            row.appendChild(operatorCol);

            const valueCol = document.createElement("div");
            valueCol.className = "col-md-3 col-sm-6";
            const valueLabel = document.createElement("label");
            valueLabel.className = "form-label small";
            const valueInputId = `account-explorer-alert-value-${alert.id}-${filter.id}`;
            valueLabel.setAttribute("for", valueInputId);
            valueLabel.textContent = translateKey("account_explorer.setup.alerts.value");
            const valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.className = "form-control form-control-sm";
            valueInput.id = valueInputId;
            valueInput.value = filter.value || "";
            valueInput.placeholder = translateKey(
              "account_explorer.setup.alerts.value_placeholder"
            );
            valueInput.dataset.alertId = alert.id;
            valueInput.dataset.filterId = filter.id;
            valueInput.dataset.role = "alert-value";
            valueCol.appendChild(valueLabel);
            valueCol.appendChild(valueInput);
            row.appendChild(valueCol);

            const removeCol = document.createElement("div");
            removeCol.className = "col-md-3 col-sm-12";
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "btn btn-outline-danger btn-sm w-100";
            removeButton.dataset.action = "delete-filter";
            removeButton.dataset.alertId = alert.id;
            removeButton.dataset.filterId = filter.id;
            removeButton.textContent = translateKey(
              "account_explorer.setup.alerts.remove_filter"
            );
            removeCol.appendChild(removeButton);
            row.appendChild(removeCol);

            filtersContainer.appendChild(row);
            updateAlertFilterValueState(alert.id, filter.id);
          });

          const addFilterWrapper = document.createElement("div");
          addFilterWrapper.className = "mt-2";
          const addFilterButton = document.createElement("button");
          addFilterButton.type = "button";
          addFilterButton.className = "btn btn-outline-primary btn-sm";
          addFilterButton.dataset.action = "add-filter";
          addFilterButton.dataset.alertId = alert.id;
          addFilterButton.textContent = translateKey(
            "account_explorer.setup.alerts.add_filter"
          );
          addFilterWrapper.appendChild(addFilterButton);

          card.appendChild(filtersContainer);
          card.appendChild(addFilterWrapper);
        }
        setupAlertList.appendChild(card);
      });
    }

    function serializeAdvancedNode(node) {
      if (!node || typeof node !== "object") {
        return null;
      }
      if (node.type === "group") {
        const logic = normalizeAdvancedGroupLogic(node.logic);
        const children = Array.isArray(node.children)
          ? node.children
              .map((child) => serializeAdvancedNode(child))
              .filter(
                (child) =>
                  child &&
                  (child.type === "group" ||
                    child.type === "condition" ||
                    child.type === "scope" ||
                    child.type === "aggregate")
              )
          : [];
        if (!children.length) {
          return null;
        }
        return { type: "group", logic, children };
      }
      if (node.type === "condition") {
        const objectKey = (node.object || "").trim();
        const fieldName = (node.field || "").trim();
        const operator = normalizeOperator(node.operator);
        if (!objectKey || !fieldName || !operator) {
          return null;
        }
        const requiresValue = operatorRequiresValue(operator);
        const value = (node.value || "").trim();
        if (requiresValue && !value) {
          return null;
        }
        const entry = { type: "condition", object: objectKey, field: fieldName, operator };
        if (requiresValue) {
          entry.value = value;
        }
        return entry;
      }
      if (node.type === "scope") {
        const objectKey = (node.object || "").trim();
        if (!objectKey) {
          return null;
        }
        const match = normalizeAdvancedScopeMatch(node.match);
        const children = Array.isArray(node.children)
          ? node.children
              .map((child) => serializeAdvancedNode(child))
              .filter((child) => child && (child.type === "condition" || child.type === "group"))
          : [];
        if (!children.length) {
          return null;
        }
        return { type: "scope", object: objectKey, match, children };
      }
      if (node.type === "aggregate") {
        const objectKey = (node.object || "").trim();
        const operation = normalizeAdvancedAggregateOperation(node.operation);
        if (!objectKey || operation !== "duplicates") {
          return null;
        }
        const fieldName = (node.field || "").trim();
        if (!fieldName) {
          return null;
        }
        const minCount = Math.max(2, parseInt(node.minCount, 10) || 2);
        const entry = {
          type: "aggregate",
          object: objectKey,
          operation,
          field: fieldName,
          minCount,
        };
        const distinctField = (node.distinctField || "").trim();
        if (distinctField) {
          entry.distinctField = distinctField;
        }
        if (node.criteria) {
          const criteria = serializeAdvancedNode(node.criteria);
          if (criteria && (criteria.type === "condition" || criteria.type === "group")) {
            entry.criteria = criteria;
          }
        }
        return entry;
      }
      return null;
    }

    function gatherSetupAlerts() {
      const alerts = [];
      const seen = new Set();
      setupAlertsState.forEach((alert) => {
        if (!alert || typeof alert !== "object") {
          return;
        }
        const label = (alert.label || "").trim();
        const alertId = typeof alert.id === "string" && alert.id ? alert.id : generateAlertId();
        if (seen.has(alertId)) {
          return;
        }
        const mode =
          alert.mode === ADVANCED_ALERT_MODES.ADVANCED
            ? ADVANCED_ALERT_MODES.ADVANCED
            : ADVANCED_ALERT_MODES.SIMPLE;
        if (mode === ADVANCED_ALERT_MODES.ADVANCED) {
          const advancedDefinition = serializeAdvancedNode(alert.advanced);
          if (!advancedDefinition) {
            return;
          }
          alerts.push({ id: alertId, label, mode, advanced: advancedDefinition });
          seen.add(alertId);
          return;
        }
        const filters = [];
        (alert.filters || []).forEach((filter) => {
          if (!filter || typeof filter !== "object") {
            return;
          }
          const objectKey = (filter.object || "").trim();
          const fieldName = (filter.field || "").trim();
          const operator = normalizeOperator(filter.operator);
          if (!objectKey || !fieldName || !operator) {
            return;
          }
          const definition = ALERT_OPERATOR_LOOKUP.get(operator);
          const needsValue = definition ? Boolean(definition.needsValue) : true;
          const value = (filter.value || "").trim();
          if (needsValue && !value) {
            return;
          }
          const entry = { object: objectKey, field: fieldName, operator };
          if (needsValue) {
            entry.value = value;
          }
          filters.push(entry);
        });
        if (!filters.length) {
          return;
        }
        alerts.push({ id: alertId, label, mode, filters });
        seen.add(alertId);
      });
      return alerts;
    }

    function handleAlertListClick(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }
      const alertId = button.dataset.alertId;
      if (!alertId) {
        return;
      }
      if (button.dataset.action === "delete-alert") {
        setupAlertsState = setupAlertsState.filter((alert) => alert && alert.id !== alertId);
        renderSetupAlerts();
        return;
      }
      const alert = findAlertById(alertId);
      if (!alert) {
        return;
      }
      if (button.dataset.action === "add-advanced-scope") {
        const parentId = button.dataset.parentId || (alert.advanced && alert.advanced.id);
        addAdvancedScope(alert, parentId);
        renderSetupAlerts();
        return;
      }
      if (button.dataset.action === "add-advanced-condition") {
        const parentId = button.dataset.parentId || (alert.advanced && alert.advanced.id);
        addAdvancedCondition(alert, parentId);
        renderSetupAlerts();
        return;
      }
      if (button.dataset.action === "add-advanced-group") {
        const parentId = button.dataset.parentId || (alert.advanced && alert.advanced.id);
        addAdvancedGroupNode(alert, parentId);
        renderSetupAlerts();
        return;
      }
      if (button.dataset.action === "add-advanced-aggregate") {
        const parentId = button.dataset.parentId || (alert.advanced && alert.advanced.id);
        addAdvancedAggregate(alert, parentId);
        renderSetupAlerts();
        return;
      }
      if (button.dataset.action === "remove-advanced-node") {
        const nodeId = button.dataset.nodeId;
        if (nodeId) {
          removeAdvancedNode(alert, nodeId);
          renderSetupAlerts();
        }
        return;
      }
      if (button.dataset.action === "add-advanced-criteria") {
        const nodeId = button.dataset.nodeId;
        if (nodeId) {
          ensureAdvancedAggregateCriteria(alert, nodeId);
          renderSetupAlerts();
        }
        return;
      }
      if (button.dataset.action === "add-filter") {
        alert.filters.push(createAlertFilter());
        renderSetupAlerts();
        return;
      }
      if (button.dataset.action === "delete-filter") {
        const filterId = button.dataset.filterId;
        alert.filters = (alert.filters || []).filter((filter) => filter && filter.id !== filterId);
        if (!alert.filters.length) {
          alert.filters.push(createAlertFilter());
        }
        renderSetupAlerts();
      }
    }

    function handleAlertListChange(event) {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const alertId = target.dataset.alertId;
      const alert = findAlertById(alertId);
      if (!alert) {
        return;
      }
      const role = target.dataset.role;
      if (role === "alert-mode") {
        const modeValue = target.value === ADVANCED_ALERT_MODES.ADVANCED
          ? ADVANCED_ALERT_MODES.ADVANCED
          : ADVANCED_ALERT_MODES.SIMPLE;
        alert.mode = modeValue;
        if (modeValue === ADVANCED_ALERT_MODES.ADVANCED) {
          ensureAdvancedRoot(alert);
        }
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-logic") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "group") {
          found.node.logic = normalizeAdvancedGroupLogic(target.value);
          renderSetupAlerts();
        }
        return;
      }
      if (role === "advanced-scope-object") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "scope") {
          found.node.object = target.value;
          renderSetupAlerts();
        }
        return;
      }
      if (role === "advanced-scope-match") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "scope") {
          found.node.match = normalizeAdvancedScopeMatch(target.value);
          renderSetupAlerts();
        }
        return;
      }
      if (role === "advanced-condition-object") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "condition") {
          found.node.object = target.value;
          renderSetupAlerts();
        }
        return;
      }
      if (role === "advanced-condition-operator") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "condition") {
          found.node.operator = normalizeOperator(target.value);
          updateAdvancedConditionValueState(alertId, nodeId);
        }
        return;
      }
      if (role === "advanced-aggregate-object") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "aggregate") {
          found.node.object = target.value;
          renderSetupAlerts();
        }
        return;
      }
      if (role === "advanced-aggregate-operation") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "aggregate") {
          found.node.operation = normalizeAdvancedAggregateOperation(target.value);
          renderSetupAlerts();
        }
        return;
      }
      const filterId = target.dataset.filterId;
      const filter = findAlertFilter(alert, filterId);
      if (!filter) {
        return;
      }
      if (role === "alert-object") {
        filter.object = target.value;
        loadAlertFieldSuggestions(alertId, filterId);
        return;
      }
      if (role === "alert-operator") {
        filter.operator = normalizeOperator(target.value);
        updateAlertFilterValueState(alertId, filterId);
      }
    }

    function handleAlertListInput(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const alertId = target.dataset.alertId;
      const alert = findAlertById(alertId);
      if (!alert) {
        return;
      }
      const role = target.dataset.role;
      if (role === "alert-label") {
        alert.label = target.value;
        return;
      }
      if (role === "advanced-field") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "condition") {
          found.node.field = target.value;
        }
        return;
      }
      if (role === "advanced-value") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "condition") {
          found.node.value = target.value;
        }
        return;
      }
      if (role === "advanced-aggregate-field") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "aggregate") {
          found.node.field = target.value;
        }
        return;
      }
      if (role === "advanced-aggregate-min-count") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "aggregate") {
          const parsed = parseInt(target.value, 10);
          const minValue = Number.isNaN(parsed) ? 2 : Math.max(2, parsed);
          found.node.minCount = minValue;
          if (String(minValue) !== target.value) {
            target.value = String(minValue);
          }
        }
        return;
      }
      if (role === "advanced-aggregate-distinct") {
        const nodeId = target.dataset.nodeId;
        const found = findAdvancedNodeById(alert, nodeId);
        if (found && found.node && found.node.type === "aggregate") {
          found.node.distinctField = target.value;
        }
        return;
      }
      const filterId = target.dataset.filterId;
      const filter = findAlertFilter(alert, filterId);
      if (!filter) {
        return;
      }
      if (role === "alert-field") {
        filter.field = target.value;
      }
      if (role === "alert-value") {
        filter.value = target.value;
      }
    }

    function handleAlertListFocus(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const role = target.dataset.role;
      if (
        role !== "advanced-field" &&
        role !== "advanced-aggregate-field" &&
        role !== "advanced-aggregate-distinct"
      ) {
        return;
      }
      const objectKey = target.dataset.object;
      if (!objectKey) {
        return;
      }
      loadFieldsForObject(objectKey)
        .then((fields) => {
          const datalistId = target.getAttribute("list");
          const datalist = datalistId ? document.getElementById(datalistId) : null;
          populateDatalistElement(datalist, fields);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "no_org") {
            showToast(translateKey("frontend.account_explorer.no_org"), "warning");
          } else {
            showToast(translateKey("frontend.account_explorer.fields_failed"), "danger");
          }
        });
    }

    function openSetupModal() {
      setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
      setupViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
      setupAlertsState = Array.isArray(configState.alerts)
        ? configState.alerts.map((alert) => cloneAlertState(alert))
        : [];
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
        contactPointSources: gatherContactPointSources(),
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
          objectDefinitions = normalizeObjectDefinitions(
            data?.connectedObjects || objectDefinitions
          );
          if (!Array.isArray(configState.alerts)) {
            configState.alerts = [];
          }
          if (
            !configState.contactPointSources ||
            typeof configState.contactPointSources !== "object"
          ) {
            configState.contactPointSources = {};
          }
          window.ACCOUNT_EXPLORER_CONFIG = configState;
          window.ACCOUNT_EXPLORER_OBJECTS = objectDefinitions;
          setupObjectsState = objectDefinitions.map((item) => ({ ...item }));
          populateSetupFieldValues();
          renderSetupObjectList();
          setupAlertsState = configState.alerts.map((alert) => cloneAlertState(alert));
          renderSetupAlerts();
          setupViewMode = configState.viewMode || DEFAULT_VIEW_MODE;
          setupViewInputs.forEach((input) => {
            input.checked = input.value === setupViewMode;
          });
          setSetupStatus(translateKey("account_explorer.setup.saved"), "success");
          showToast(translateKey("frontend.account_explorer.config_saved"), "success");
          if (explorerResult && explorerResult.data) {
            explorerResult.data.objects = objectDefinitions;
            explorerResult.data.alerts = configState.alerts;
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
    if (setupAlertAddButton) {
      setupAlertAddButton.addEventListener("click", () => {
        setupAlertsState.push(cloneAlertState({}));
        renderSetupAlerts();
      });
    }
    if (setupAlertList) {
      setupAlertList.addEventListener("click", handleAlertListClick);
      setupAlertList.addEventListener("change", handleAlertListChange);
      setupAlertList.addEventListener("input", handleAlertListInput);
      setupAlertList.addEventListener("focusin", handleAlertListFocus);
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
