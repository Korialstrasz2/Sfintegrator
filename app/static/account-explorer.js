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
      const connections = Array.isArray(item.connections)
        ? item.connections
            .map((connection) => {
              if (!connection || typeof connection !== "object") {
                return null;
              }
              const field = typeof connection.field === "string" ? connection.field : "";
              const target = typeof connection.target === "string" ? connection.target : "";
              if (!field) {
                return null;
              }
              return target ? { field, target } : { field };
            })
            .filter(Boolean)
        : [];
      normalized.push({ key, label, hidden: Boolean(item.hidden), connections });
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

  function getObjectConnections(key) {
    if (key === "Account") {
      return [];
    }
    const definitions = getObjectDefinitions();
    const definition = definitions.find((item) => item && item.key === key);
    if (!definition) {
      return [];
    }
    const connections = Array.isArray(definition.connections) ? definition.connections : [];
    return connections.filter(
      (connection) => connection && typeof connection.field === "string" && connection.field
    );
  }

  function getAdvancedEntityConnectionMessages(objectKey) {
    if (!objectKey) {
      return [
        translateKey("account_explorer.setup.alerts.advanced.entities.connections.missing"),
      ];
    }
    if (objectKey === "Account") {
      return [
        translateKey("account_explorer.setup.alerts.advanced.entities.connections.account"),
      ];
    }
    const connections = getObjectConnections(objectKey);
    if (!connections.length) {
      return [
        translateKey("account_explorer.setup.alerts.advanced.entities.connections.none"),
      ];
    }
    const messages = connections
      .map((connection) => {
        const field = typeof connection.field === "string" ? connection.field : "";
        if (!field) {
          return null;
        }
        const targetKey = typeof connection.target === "string" ? connection.target : "";
        if (targetKey === "Account") {
          return translateKey(
            "account_explorer.setup.alerts.advanced.entities.connections.to_account",
            { field }
          );
        }
        if (targetKey) {
          const targetLabel = getObjectLabel(targetKey);
          return translateKey(
            "account_explorer.setup.alerts.advanced.entities.connections.to_object",
            { field, target: targetLabel }
          );
        }
        return translateKey(
          "account_explorer.setup.alerts.advanced.entities.connections.generic",
          { field }
        );
      })
      .filter((message) => typeof message === "string" && message);
    if (!messages.length) {
      return [
        translateKey("account_explorer.setup.alerts.advanced.entities.connections.none"),
      ];
    }
    return messages;
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

  const ALERT_MODE_BASIC = "basic";
  const ALERT_MODE_ADVANCED = "advanced";
  const ADVANCED_VALUE_TYPE_VALUE = "value";
  const ADVANCED_VALUE_TYPE_ENTITY = "entity";
  const ADVANCED_ENTITY_COMPARISON_OPERATORS = new Set([
    "equals",
    "equals_ignore_case",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
  ]);

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

  function createAdvancedEntity(initial = {}) {
    return {
      id: generateAlertId("entity"),
      alias: typeof initial.alias === "string" ? initial.alias : "",
      object: typeof initial.object === "string" ? initial.object : "",
      locked: Boolean(initial.locked),
      distinctFrom: Array.isArray(initial.distinctFrom)
        ? initial.distinctFrom.filter((value) => typeof value === "string" && value)
        : [],
    };
  }

  function createAdvancedCondition(existing = {}) {
    const operator = normalizeOperator(existing.operator);
    const valueType = existing.valueType === ADVANCED_VALUE_TYPE_ENTITY ? ADVANCED_VALUE_TYPE_ENTITY : ADVANCED_VALUE_TYPE_VALUE;
    const condition = {
      id: typeof existing.id === "string" && existing.id ? existing.id : generateAlertId("condition"),
      type: "condition",
      entityId: typeof existing.entityId === "string" ? existing.entityId : "",
      field: typeof existing.field === "string" ? existing.field : "",
      operator,
      valueType,
      value: typeof existing.value === "string" ? existing.value : "",
      targetEntityId: typeof existing.targetEntityId === "string" ? existing.targetEntityId : "",
      targetField: typeof existing.targetField === "string" ? existing.targetField : "",
    };
    if (valueType === ADVANCED_VALUE_TYPE_ENTITY) {
      condition.value = "";
    } else {
      condition.targetEntityId = "";
      condition.targetField = "";
    }
    return condition;
  }

  function createAdvancedGroup(existing = {}) {
    const group = {
      id: typeof existing.id === "string" && existing.id ? existing.id : generateAlertId("group"),
      type: "group",
      operator: existing.operator === "or" ? "or" : "and",
      children: [],
    };
    const children = Array.isArray(existing.children) ? existing.children : [];
    children.forEach((child) => {
      if (!child || typeof child !== "object") {
        return;
      }
      if (child.type === "group") {
        group.children.push(createAdvancedGroup(child));
      } else if (child.type === "condition") {
        group.children.push(createAdvancedCondition(child));
      }
    });
    if (!group.children.length) {
      group.children.push(createAdvancedCondition({}));
    }
    return group;
  }

  function duplicateAdvancedGroup(group, entityIdMap) {
    const duplicated = {
      id: generateAlertId("group"),
      type: "group",
      operator: group && group.operator === "or" ? "or" : "and",
      children: [],
    };
    const children = Array.isArray(group?.children) ? group.children : [];
    children.forEach((child) => {
      if (!child || typeof child !== "object") {
        return;
      }
      if (child.type === "group") {
        duplicated.children.push(duplicateAdvancedGroup(child, entityIdMap));
      } else if (child.type === "condition") {
        const condition = createAdvancedCondition({
          entityId: entityIdMap.get(child.entityId) || "",
          field: child.field,
          operator: child.operator,
          valueType: child.valueType,
          value: child.value,
          targetEntityId: entityIdMap.get(child.targetEntityId) || "",
          targetField: child.targetField,
        });
        condition.id = generateAlertId("condition");
        duplicated.children.push(condition);
      }
    });
    if (!duplicated.children.length) {
      duplicated.children.push(createAdvancedCondition({}));
    }
    return duplicated;
  }

  function duplicateAdvancedDefinition(source) {
    if (!source || typeof source !== "object") {
      return createDefaultAdvancedDefinition();
    }
    const entityIdMap = new Map();
    const entities = Array.isArray(source.entities)
      ? source.entities
          .map((entity) => {
            if (!entity || typeof entity !== "object") {
              return null;
            }
            const newId = generateAlertId("entity");
            entityIdMap.set(entity.id, newId);
            return {
              id: newId,
              alias: typeof entity.alias === "string" ? entity.alias : "",
              object: typeof entity.object === "string" ? entity.object : "",
              locked: Boolean(entity.locked),
              distinctFrom: [],
            };
          })
          .filter(Boolean)
      : [];
    if (!entities.length) {
      return createDefaultAdvancedDefinition();
    }
    source.entities.forEach((entity, index) => {
      const target = entities[index];
      if (!target) {
        return;
      }
      const distinctFrom = Array.isArray(entity.distinctFrom) ? entity.distinctFrom : [];
      target.distinctFrom = distinctFrom
        .map((entityId) => entityIdMap.get(entityId))
        .filter((value) => typeof value === "string" && value && value !== target.id);
    });
    const root = duplicateAdvancedGroup(source.root, entityIdMap);
    return { entities, root };
  }

  function cloneAdvancedGroupFromDefinition(rawGroup, aliasToId) {
    if (!rawGroup || typeof rawGroup !== "object" || rawGroup.type !== "group") {
      return createAdvancedGroup({});
    }
    const group = {
      id: generateAlertId("group"),
      type: "group",
      operator: rawGroup.operator === "or" ? "or" : "and",
      children: [],
    };
    const children = Array.isArray(rawGroup.children) ? rawGroup.children : [];
    children.forEach((child) => {
      if (!child || typeof child !== "object") {
        return;
      }
      if (child.type === "group") {
        const nested = cloneAdvancedGroupFromDefinition(child, aliasToId);
        if (nested) {
          group.children.push(nested);
        }
      } else if (child.type === "condition") {
        const entityAlias = typeof child.entity === "string" ? child.entity : "";
        const entityId = aliasToId.get(entityAlias);
        if (!entityId) {
          return;
        }
        const valueType = child.valueType === ADVANCED_VALUE_TYPE_ENTITY ? ADVANCED_VALUE_TYPE_ENTITY : ADVANCED_VALUE_TYPE_VALUE;
        const condition = createAdvancedCondition({
          entityId,
          field: child.field,
          operator: child.operator,
          valueType,
          value: child.value,
          targetEntityId: aliasToId.get(child.targetEntity),
          targetField: child.targetField,
        });
        condition.id = generateAlertId("condition");
        if (valueType === ADVANCED_VALUE_TYPE_ENTITY && (!condition.targetEntityId || !condition.targetField)) {
          return;
        }
        group.children.push(condition);
      }
    });
    if (!group.children.length) {
      group.children.push(createAdvancedCondition({}));
    }
    return group;
  }

  function cloneAdvancedDefinitionFromServer(definition) {
    if (!definition || typeof definition !== "object") {
      return createDefaultAdvancedDefinition();
    }
    const rawEntities = Array.isArray(definition.entities) ? definition.entities : [];
    if (!rawEntities.length) {
      return createDefaultAdvancedDefinition();
    }
    const entities = [];
    const aliasToId = new Map();
    rawEntities.forEach((entity) => {
      if (!entity || typeof entity !== "object") {
        return;
      }
      const alias = typeof entity.alias === "string" ? entity.alias : "";
      const objectKey = typeof entity.object === "string" ? entity.object : "";
      if (!alias || !objectKey) {
        return;
      }
      const newEntity = {
        id: generateAlertId("entity"),
        alias,
        object: objectKey,
        locked: objectKey === "Account",
        distinctFrom: [],
      };
      entities.push(newEntity);
      aliasToId.set(alias, newEntity.id);
    });
    if (!entities.length) {
      return createDefaultAdvancedDefinition();
    }
    rawEntities.forEach((entity) => {
      if (!entity || typeof entity !== "object") {
        return;
      }
      const alias = typeof entity.alias === "string" ? entity.alias : "";
      const target = entities.find((entry) => entry.alias === alias);
      if (!target) {
        return;
      }
      const distinctFrom = Array.isArray(entity.distinctFrom) ? entity.distinctFrom : [];
      target.distinctFrom = distinctFrom
        .map((aliasRef) => aliasToId.get(aliasRef))
        .filter((value) => typeof value === "string" && value && value !== target.id);
    });
    const root = cloneAdvancedGroupFromDefinition(definition.logic, aliasToId);
    return { entities, root };
  }

  function createDefaultAdvancedDefinition() {
    const accountEntity = createAdvancedEntity({ alias: "account", object: "Account", locked: true });
    return {
      entities: [accountEntity],
      root: createAdvancedGroup({ children: [createAdvancedCondition({ entityId: accountEntity.id })] }),
    };
  }

  function cloneAlertState(alert) {
    const mode = alert?.mode === ALERT_MODE_ADVANCED ? ALERT_MODE_ADVANCED : ALERT_MODE_BASIC;
    const filters = Array.isArray(alert?.filters)
      ? alert.filters.map((filter) => createAlertFilter(filter))
      : [createAlertFilter()];
    if (!filters.length) {
      filters.push(createAlertFilter());
    }
    let advanced;
    if (alert?.advanced) {
      advanced = duplicateAdvancedDefinition(alert.advanced);
    } else if (alert?.definition) {
      advanced = cloneAdvancedDefinitionFromServer(alert.definition);
    } else {
      advanced = createDefaultAdvancedDefinition();
    }
    if (!advanced || typeof advanced !== "object") {
      advanced = createDefaultAdvancedDefinition();
    }
    if (!Array.isArray(advanced.entities) || !advanced.entities.length) {
      const fallback = createDefaultAdvancedDefinition();
      advanced.entities = fallback.entities;
      advanced.root = fallback.root;
    }
    if (!advanced.root || typeof advanced.root !== "object") {
      advanced.root = createDefaultAdvancedDefinition().root;
    }
    return {
      id: typeof alert?.id === "string" && alert.id ? alert.id : generateAlertId(),
      label: typeof alert?.label === "string" ? alert.label : "",
      mode,
      filters,
      advanced,
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

    function findAdvancedEntity(alert, entityId) {
      if (!alert || !alert.advanced || !Array.isArray(alert.advanced.entities)) {
        return null;
      }
      return alert.advanced.entities.find((entity) => entity && entity.id === entityId) || null;
    }

    function ensureAdvancedEntityReferences(alert) {
      if (!alert || !alert.advanced || !Array.isArray(alert.advanced.entities)) {
        return;
      }
      const validIds = new Set(alert.advanced.entities.map((entity) => entity.id));
      alert.advanced.entities.forEach((entity) => {
        if (!entity || !Array.isArray(entity.distinctFrom)) {
          return;
        }
        entity.distinctFrom = entity.distinctFrom.filter((entityId) => validIds.has(entityId) && entityId !== entity.id);
      });
    }

    function walkAdvancedGroups(group, callback) {
      if (!group || typeof group !== "object") {
        return;
      }
      callback(group);
      const children = Array.isArray(group.children) ? group.children : [];
      children.forEach((child) => {
        if (!child || typeof child !== "object") {
          return;
        }
        if (child.type === "group") {
          walkAdvancedGroups(child, callback);
        }
      });
    }

    function findAdvancedGroupById(group, groupId) {
      let match = null;
      walkAdvancedGroups(group, (entry) => {
        if (match || entry.id !== groupId) {
          return;
        }
        match = entry;
      });
      return match;
    }

    function removeAdvancedEntity(alert, entityId) {
      if (!alert || !alert.advanced) {
        return;
      }
      alert.advanced.entities = (alert.advanced.entities || []).filter((entity) => entity && entity.id !== entityId);
      ensureAdvancedEntityReferences(alert);
      if (alert.advanced.root && typeof alert.advanced.root === "object") {
        const prune = (group) => {
          if (!group || typeof group !== "object") {
            return;
          }
          group.children = Array.isArray(group.children)
            ? group.children.filter((child) => {
                if (!child || typeof child !== "object") {
                  return false;
                }
                if (child.type === "condition") {
                  if (child.entityId === entityId || child.targetEntityId === entityId) {
                    return false;
                  }
                  return true;
                }
                if (child.type === "group") {
                  prune(child);
                  return Array.isArray(child.children) && child.children.length > 0;
                }
                return false;
              })
            : [];
        };
        prune(alert.advanced.root);
        if (!Array.isArray(alert.advanced.root.children) || !alert.advanced.root.children.length) {
          alert.advanced.root.children = [createAdvancedCondition({})];
        }
      }
    }

    function removeAdvancedGroup(alert, groupId) {
      if (!alert || !alert.advanced || !alert.advanced.root) {
        return;
      }
      if (alert.advanced.root.id === groupId) {
        return;
      }
      const stack = [alert.advanced.root];
      while (stack.length) {
        const current = stack.pop();
        if (!current || !Array.isArray(current.children)) {
          continue;
        }
        current.children = current.children.filter((child) => {
          if (!child || typeof child !== "object") {
            return false;
          }
          if (child.type === "group") {
            if (child.id === groupId) {
              return false;
            }
            stack.push(child);
            return true;
          }
          return true;
        });
      }
      if (!Array.isArray(alert.advanced.root.children) || !alert.advanced.root.children.length) {
        alert.advanced.root.children = [createAdvancedCondition({})];
      }
    }

    function formatAdvancedEntityOption(entity) {
      if (!entity) {
        return "";
      }
      const objectLabel = entity.object ? getObjectLabel(entity.object) : "";
      if (entity.alias && objectLabel) {
        return `${entity.alias} — ${objectLabel}`;
      }
      if (entity.alias) {
        return entity.alias;
      }
      return objectLabel || translateKey("account_explorer.setup.alerts.advanced.entities.unnamed");
    }

    function renderBasicAlertSection(alert, alertObjects) {
      const container = document.createElement("div");
      container.className = "d-grid gap-2";
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
        objectPlaceholder.textContent = translateKey("account_explorer.setup.alerts.object_placeholder");
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
        fieldInput.addEventListener("focus", () => loadAlertFieldSuggestions(alert.id, filter.id));
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
        valueInput.placeholder = translateKey("account_explorer.setup.alerts.value_placeholder");
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
        removeButton.textContent = translateKey("account_explorer.setup.alerts.remove_filter");
        removeCol.appendChild(removeButton);
        row.appendChild(removeCol);

        container.appendChild(row);
        updateAlertFilterValueState(alert.id, filter.id);
      });

      const addFilterWrapper = document.createElement("div");
      addFilterWrapper.className = "mt-2";
      const addFilterButton = document.createElement("button");
      addFilterButton.type = "button";
      addFilterButton.className = "btn btn-outline-primary btn-sm";
      addFilterButton.dataset.action = "add-filter";
      addFilterButton.dataset.alertId = alert.id;
      addFilterButton.textContent = translateKey("account_explorer.setup.alerts.add_filter");
      addFilterWrapper.appendChild(addFilterButton);
      container.appendChild(addFilterWrapper);
      return container;
    }

    function renderAdvancedEntitiesSection(alert, alertObjects) {
      const section = document.createElement("div");
      section.className = "d-flex flex-column gap-2";

      const heading = document.createElement("div");
      heading.className = "d-flex flex-column";
      const title = document.createElement("h6");
      title.className = "fw-semibold mb-1";
      title.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.title");
      const description = document.createElement("small");
      description.className = "text-muted";
      description.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.help");
      heading.appendChild(title);
      heading.appendChild(description);
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "d-grid gap-2";
      alert.advanced.entities.forEach((entity) => {
        if (!entity) {
          return;
        }
        const row = document.createElement("div");
        row.className = "row g-2 align-items-end";
        row.dataset.entityId = entity.id;

        const aliasCol = document.createElement("div");
        aliasCol.className = "col-lg-3 col-md-4";
        const aliasLabel = document.createElement("label");
        aliasLabel.className = "form-label small";
        const aliasInputId = `account-explorer-advanced-alias-${alert.id}-${entity.id}`;
        aliasLabel.setAttribute("for", aliasInputId);
        aliasLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.alias");
        const aliasInput = document.createElement("input");
        aliasInput.type = "text";
        aliasInput.className = "form-control form-control-sm";
        aliasInput.id = aliasInputId;
        aliasInput.value = entity.alias || "";
        aliasInput.dataset.alertId = alert.id;
        aliasInput.dataset.entityId = entity.id;
        aliasInput.dataset.role = "advanced-entity-alias";
        aliasCol.appendChild(aliasLabel);
        aliasCol.appendChild(aliasInput);
        row.appendChild(aliasCol);

        const objectCol = document.createElement("div");
        objectCol.className = "col-lg-3 col-md-4";
        const objectLabel = document.createElement("label");
        objectLabel.className = "form-label small";
        const objectSelectId = `account-explorer-advanced-object-${alert.id}-${entity.id}`;
        objectLabel.setAttribute("for", objectSelectId);
        objectLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.object");
        const objectSelect = document.createElement("select");
        objectSelect.className = "form-select form-select-sm";
        objectSelect.id = objectSelectId;
        objectSelect.dataset.alertId = alert.id;
        objectSelect.dataset.entityId = entity.id;
        objectSelect.dataset.role = "advanced-entity-object";
        objectSelect.disabled = Boolean(entity.locked);
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = translateKey("account_explorer.setup.alerts.object_placeholder");
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
        objectSelect.value = entity.object || "";
        objectCol.appendChild(objectLabel);
        objectCol.appendChild(objectSelect);
        const connectionsWrapper = document.createElement("div");
        connectionsWrapper.className = "mt-2";
        const connectionsLabel = document.createElement("div");
        connectionsLabel.className = "small text-muted fw-semibold";
        connectionsLabel.textContent = translateKey(
          "account_explorer.setup.alerts.advanced.entities.connections.label"
        );
        connectionsWrapper.appendChild(connectionsLabel);
        const connectionsList = document.createElement("ul");
        connectionsList.className = "list-unstyled small text-muted mb-0";
        const connectionMessages = getAdvancedEntityConnectionMessages(entity.object);
        connectionMessages.forEach((message) => {
          const item = document.createElement("li");
          item.textContent = message;
          connectionsList.appendChild(item);
        });
        connectionsWrapper.appendChild(connectionsList);
        objectCol.appendChild(connectionsWrapper);
        row.appendChild(objectCol);

        const distinctCol = document.createElement("div");
        distinctCol.className = "col-lg-4 col-md-6";
        const distinctLabel = document.createElement("label");
        distinctLabel.className = "form-label small";
        const distinctSelectId = `account-explorer-advanced-distinct-${alert.id}-${entity.id}`;
        distinctLabel.setAttribute("for", distinctSelectId);
        distinctLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.distinct");
        const distinctSelect = document.createElement("select");
        distinctSelect.id = distinctSelectId;
        distinctSelect.multiple = true;
        distinctSelect.className = "form-select form-select-sm";
        distinctSelect.dataset.alertId = alert.id;
        distinctSelect.dataset.entityId = entity.id;
        distinctSelect.dataset.role = "advanced-entity-distinct";
        alert.advanced.entities.forEach((candidate) => {
          if (!candidate || candidate.id === entity.id) {
            return;
          }
          const option = document.createElement("option");
          option.value = candidate.id;
          option.textContent = formatAdvancedEntityOption(candidate);
          option.selected = Array.isArray(entity.distinctFrom) ? entity.distinctFrom.includes(candidate.id) : false;
          distinctSelect.appendChild(option);
        });
        distinctCol.appendChild(distinctLabel);
        distinctCol.appendChild(distinctSelect);
        const distinctHelp = document.createElement("div");
        distinctHelp.className = "form-text";
        distinctHelp.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.distinct_help");
        distinctCol.appendChild(distinctHelp);
        row.appendChild(distinctCol);

        const removeCol = document.createElement("div");
        removeCol.className = "col-lg-2 col-md-4";
        if (!entity.locked) {
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "btn btn-outline-danger btn-sm w-100";
          removeButton.dataset.alertId = alert.id;
          removeButton.dataset.entityId = entity.id;
          removeButton.dataset.role = "remove-advanced-entity";
          removeButton.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.remove");
          removeCol.appendChild(removeButton);
        }
        row.appendChild(removeCol);

        list.appendChild(row);
      });
      section.appendChild(list);

      const addWrapper = document.createElement("div");
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "btn btn-outline-primary btn-sm";
      addButton.dataset.alertId = alert.id;
      addButton.dataset.role = "add-advanced-entity";
      addButton.textContent = translateKey("account_explorer.setup.alerts.advanced.entities.add");
      addWrapper.appendChild(addButton);
      section.appendChild(addWrapper);
      return section;
    }

    function loadAdvancedFieldSuggestions(alertId, entityId, datalistId) {
      const alert = findAlertById(alertId);
      if (!alert || !alert.advanced) {
        return;
      }
      const entity = findAdvancedEntity(alert, entityId);
      if (!entity || !entity.object) {
        return;
      }
      loadFieldsForObject(entity.object)
        .then((fields) => {
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

    function renderAdvancedCondition(alert, group, condition) {
      if (condition.valueType === ADVANCED_VALUE_TYPE_ENTITY && !ADVANCED_ENTITY_COMPARISON_OPERATORS.has(condition.operator)) {
        condition.operator = "equals";
      }
      const row = document.createElement("div");
      row.className = "row g-2 align-items-end";
      row.dataset.groupId = group.id;
      row.dataset.conditionId = condition.id;

      const entityCol = document.createElement("div");
      entityCol.className = "col-12 col-lg-3 col-md-4";
      const entityLabel = document.createElement("label");
      entityLabel.className = "form-label small";
      const entitySelectId = `account-explorer-advanced-condition-entity-${alert.id}-${condition.id}`;
      entityLabel.setAttribute("for", entitySelectId);
      entityLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.entity");
      const entitySelect = document.createElement("select");
      entitySelect.className = "form-select form-select-sm";
      entitySelect.id = entitySelectId;
      entitySelect.dataset.alertId = alert.id;
      entitySelect.dataset.groupId = group.id;
      entitySelect.dataset.conditionId = condition.id;
      entitySelect.dataset.role = "advanced-condition-entity";
      const entityPlaceholder = document.createElement("option");
      entityPlaceholder.value = "";
      entityPlaceholder.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.entity_placeholder");
      entitySelect.appendChild(entityPlaceholder);
      alert.advanced.entities.forEach((entity) => {
        if (!entity) {
          return;
        }
        const option = document.createElement("option");
        option.value = entity.id;
        option.textContent = formatAdvancedEntityOption(entity);
        entitySelect.appendChild(option);
      });
      entitySelect.value = condition.entityId || "";
      entityCol.appendChild(entityLabel);
      entityCol.appendChild(entitySelect);
      row.appendChild(entityCol);

      const fieldCol = document.createElement("div");
      fieldCol.className = "col-12 col-lg-3 col-md-4";
      const fieldLabel = document.createElement("label");
      fieldLabel.className = "form-label small";
      const fieldInputId = `account-explorer-advanced-condition-field-${alert.id}-${condition.id}`;
      fieldLabel.setAttribute("for", fieldInputId);
      fieldLabel.textContent = translateKey("account_explorer.setup.alerts.field");
      const fieldInput = document.createElement("input");
      fieldInput.type = "text";
      fieldInput.className = "form-control form-control-sm";
      fieldInput.id = fieldInputId;
      fieldInput.value = condition.field || "";
      fieldInput.dataset.alertId = alert.id;
      fieldInput.dataset.groupId = group.id;
      fieldInput.dataset.conditionId = condition.id;
      fieldInput.dataset.role = "advanced-condition-field";
      const fieldDatalistId = `account-explorer-advanced-field-datalist-${alert.id}-${condition.id}`;
      fieldInput.setAttribute("list", fieldDatalistId);
      fieldInput.disabled = !condition.entityId;
      fieldInput.addEventListener("focus", () => {
        if (condition.entityId) {
          loadAdvancedFieldSuggestions(alert.id, condition.entityId, fieldDatalistId);
        }
      });
      const fieldDatalist = document.createElement("datalist");
      fieldDatalist.id = fieldDatalistId;
      fieldCol.appendChild(fieldLabel);
      fieldCol.appendChild(fieldInput);
      fieldCol.appendChild(fieldDatalist);
      row.appendChild(fieldCol);

      const operatorCol = document.createElement("div");
      operatorCol.className = "col-6 col-lg-2 col-md-4";
      const operatorLabel = document.createElement("label");
      operatorLabel.className = "form-label small";
      const operatorSelectId = `account-explorer-advanced-condition-operator-${alert.id}-${condition.id}`;
      operatorLabel.setAttribute("for", operatorSelectId);
      operatorLabel.textContent = translateKey("account_explorer.setup.alerts.operator");
      const operatorSelect = document.createElement("select");
      operatorSelect.className = "form-select form-select-sm";
      operatorSelect.id = operatorSelectId;
      operatorSelect.dataset.alertId = alert.id;
      operatorSelect.dataset.groupId = group.id;
      operatorSelect.dataset.conditionId = condition.id;
      operatorSelect.dataset.role = "advanced-condition-operator";
      ALERT_OPERATORS.forEach((operator) => {
        const option = document.createElement("option");
        option.value = operator.value;
        option.textContent = translateKey(operator.labelKey);
        operatorSelect.appendChild(option);
      });
      operatorSelect.value = normalizeOperator(condition.operator);
      operatorCol.appendChild(operatorLabel);
      operatorCol.appendChild(operatorSelect);
      row.appendChild(operatorCol);

      const compareCol = document.createElement("div");
      compareCol.className = "col-6 col-lg-2 col-md-4";
      const compareLabel = document.createElement("label");
      compareLabel.className = "form-label small";
      const compareSelectId = `account-explorer-advanced-condition-compare-${alert.id}-${condition.id}`;
      compareLabel.setAttribute("for", compareSelectId);
      compareLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.compare_type");
      const compareSelect = document.createElement("select");
      compareSelect.className = "form-select form-select-sm";
      compareSelect.id = compareSelectId;
      compareSelect.dataset.alertId = alert.id;
      compareSelect.dataset.groupId = group.id;
      compareSelect.dataset.conditionId = condition.id;
      compareSelect.dataset.role = "advanced-condition-value-type";
      const valueOption = document.createElement("option");
      valueOption.value = ADVANCED_VALUE_TYPE_VALUE;
      valueOption.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.compare_value");
      const entityOption = document.createElement("option");
      entityOption.value = ADVANCED_VALUE_TYPE_ENTITY;
      entityOption.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.compare_entity");
      compareSelect.appendChild(valueOption);
      compareSelect.appendChild(entityOption);
      compareSelect.value = condition.valueType === ADVANCED_VALUE_TYPE_ENTITY ? ADVANCED_VALUE_TYPE_ENTITY : ADVANCED_VALUE_TYPE_VALUE;
      compareCol.appendChild(compareLabel);
      compareCol.appendChild(compareSelect);
      row.appendChild(compareCol);

      const valueCol = document.createElement("div");
      valueCol.className = "col-12 col-lg-3 col-md-4";
      valueCol.hidden = condition.valueType === ADVANCED_VALUE_TYPE_ENTITY || !operatorRequiresValue(condition.operator);
      const valueLabel = document.createElement("label");
      valueLabel.className = "form-label small";
      const valueInputId = `account-explorer-advanced-condition-value-${alert.id}-${condition.id}`;
      valueLabel.setAttribute("for", valueInputId);
      valueLabel.textContent = translateKey("account_explorer.setup.alerts.value");
      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "form-control form-control-sm";
      valueInput.id = valueInputId;
      valueInput.value = condition.value || "";
      valueInput.placeholder = translateKey("account_explorer.setup.alerts.value_placeholder");
      valueInput.disabled = !operatorRequiresValue(condition.operator);
      valueInput.dataset.alertId = alert.id;
      valueInput.dataset.groupId = group.id;
      valueInput.dataset.conditionId = condition.id;
      valueInput.dataset.role = "advanced-condition-value";
      valueCol.appendChild(valueLabel);
      valueCol.appendChild(valueInput);
      row.appendChild(valueCol);

      const targetEntityCol = document.createElement("div");
      targetEntityCol.className = "col-12 col-lg-3 col-md-4";
      targetEntityCol.hidden = condition.valueType !== ADVANCED_VALUE_TYPE_ENTITY;
      const targetEntityLabel = document.createElement("label");
      targetEntityLabel.className = "form-label small";
      const targetEntitySelectId = `account-explorer-advanced-condition-target-entity-${alert.id}-${condition.id}`;
      targetEntityLabel.setAttribute("for", targetEntitySelectId);
      targetEntityLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.target_entity");
      const targetEntitySelect = document.createElement("select");
      targetEntitySelect.className = "form-select form-select-sm";
      targetEntitySelect.id = targetEntitySelectId;
      targetEntitySelect.dataset.alertId = alert.id;
      targetEntitySelect.dataset.groupId = group.id;
      targetEntitySelect.dataset.conditionId = condition.id;
      targetEntitySelect.dataset.role = "advanced-condition-target-entity";
      const targetPlaceholder = document.createElement("option");
      targetPlaceholder.value = "";
      targetPlaceholder.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.conditions.entity_placeholder"
      );
      targetEntitySelect.appendChild(targetPlaceholder);
      alert.advanced.entities.forEach((entity) => {
        if (!entity) {
          return;
        }
        const option = document.createElement("option");
        option.value = entity.id;
        option.textContent = formatAdvancedEntityOption(entity);
        targetEntitySelect.appendChild(option);
      });
      targetEntitySelect.value = condition.targetEntityId || "";
      targetEntityCol.appendChild(targetEntityLabel);
      targetEntityCol.appendChild(targetEntitySelect);
      row.appendChild(targetEntityCol);

      const targetFieldCol = document.createElement("div");
      targetFieldCol.className = "col-12 col-lg-3 col-md-4";
      targetFieldCol.hidden = condition.valueType !== ADVANCED_VALUE_TYPE_ENTITY;
      const targetFieldLabel = document.createElement("label");
      targetFieldLabel.className = "form-label small";
      const targetFieldInputId = `account-explorer-advanced-condition-target-field-${alert.id}-${condition.id}`;
      targetFieldLabel.setAttribute("for", targetFieldInputId);
      targetFieldLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.target_field");
      const targetFieldInput = document.createElement("input");
      targetFieldInput.type = "text";
      targetFieldInput.className = "form-control form-control-sm";
      targetFieldInput.id = targetFieldInputId;
      targetFieldInput.value = condition.targetField || "";
      targetFieldInput.dataset.alertId = alert.id;
      targetFieldInput.dataset.groupId = group.id;
      targetFieldInput.dataset.conditionId = condition.id;
      targetFieldInput.dataset.role = "advanced-condition-target-field";
      const targetFieldDatalistId = `account-explorer-advanced-condition-target-datalist-${alert.id}-${condition.id}`;
      targetFieldInput.setAttribute("list", targetFieldDatalistId);
      targetFieldInput.disabled = !condition.targetEntityId;
      targetFieldInput.addEventListener("focus", () => {
        if (condition.targetEntityId) {
          loadAdvancedFieldSuggestions(alert.id, condition.targetEntityId, targetFieldDatalistId);
        }
      });
      const targetFieldDatalist = document.createElement("datalist");
      targetFieldDatalist.id = targetFieldDatalistId;
      targetFieldCol.appendChild(targetFieldLabel);
      targetFieldCol.appendChild(targetFieldInput);
      targetFieldCol.appendChild(targetFieldDatalist);
      row.appendChild(targetFieldCol);

      const removeCol = document.createElement("div");
      removeCol.className = "col-12 col-lg-2 col-md-4";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-outline-danger btn-sm w-100";
      removeButton.dataset.alertId = alert.id;
      removeButton.dataset.groupId = group.id;
      removeButton.dataset.conditionId = condition.id;
      removeButton.dataset.role = "remove-advanced-condition";
      removeButton.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.remove_condition");
      removeCol.appendChild(removeButton);
      row.appendChild(removeCol);

      return row;
    }

    function renderAdvancedGroup(alert, group, { depth = 0, isRoot = false } = {}) {
      const container = document.createElement("div");
      container.className = depth ? "border rounded p-3 bg-light" : "border rounded p-3";
      container.dataset.alertId = alert.id;
      container.dataset.groupId = group.id;

      const header = document.createElement("div");
      header.className = "d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2";
      const title = document.createElement("div");
      title.className = "d-flex align-items-center gap-2";
      const operatorLabel = document.createElement("span");
      operatorLabel.className = "form-label small mb-0";
      operatorLabel.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.group_operator");
      const operatorSelect = document.createElement("select");
      operatorSelect.className = "form-select form-select-sm";
      operatorSelect.dataset.alertId = alert.id;
      operatorSelect.dataset.groupId = group.id;
      operatorSelect.dataset.role = "advanced-group-operator";
      const andOption = document.createElement("option");
      andOption.value = "and";
      andOption.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.group_operator_and");
      const orOption = document.createElement("option");
      orOption.value = "or";
      orOption.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.group_operator_or");
      operatorSelect.appendChild(andOption);
      operatorSelect.appendChild(orOption);
      operatorSelect.value = group.operator === "or" ? "or" : "and";
      title.appendChild(operatorLabel);
      title.appendChild(operatorSelect);
      header.appendChild(title);

      if (!isRoot) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.dataset.alertId = alert.id;
        removeButton.dataset.groupId = group.id;
        removeButton.dataset.role = "remove-advanced-group";
        removeButton.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.remove_group");
        header.appendChild(removeButton);
      }
      container.appendChild(header);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "d-flex flex-column gap-2";
      (group.children || []).forEach((child) => {
        if (!child || typeof child !== "object") {
          return;
        }
        if (child.type === "group") {
          childrenContainer.appendChild(
            renderAdvancedGroup(alert, child, { depth: depth + 1, isRoot: false })
          );
        } else if (child.type === "condition") {
          childrenContainer.appendChild(renderAdvancedCondition(alert, group, child));
        }
      });
      container.appendChild(childrenContainer);

      const actions = document.createElement("div");
      actions.className = "d-flex flex-wrap gap-2 mt-3";
      const addConditionButton = document.createElement("button");
      addConditionButton.type = "button";
      addConditionButton.className = "btn btn-outline-primary btn-sm";
      addConditionButton.dataset.alertId = alert.id;
      addConditionButton.dataset.groupId = group.id;
      addConditionButton.dataset.role = "add-advanced-condition";
      addConditionButton.textContent = translateKey(
        "account_explorer.setup.alerts.advanced.conditions.add_condition"
      );
      const addGroupButton = document.createElement("button");
      addGroupButton.type = "button";
      addGroupButton.className = "btn btn-outline-secondary btn-sm";
      addGroupButton.dataset.alertId = alert.id;
      addGroupButton.dataset.groupId = group.id;
      addGroupButton.dataset.role = "add-advanced-group";
      addGroupButton.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.add_group");
      actions.appendChild(addConditionButton);
      actions.appendChild(addGroupButton);
      container.appendChild(actions);
      return container;
    }

    function renderAdvancedConditionsSection(alert) {
      const section = document.createElement("div");
      section.className = "d-flex flex-column gap-2";

      const heading = document.createElement("div");
      heading.className = "d-flex flex-column";
      const title = document.createElement("h6");
      title.className = "fw-semibold mb-1";
      title.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.title");
      const description = document.createElement("small");
      description.className = "text-muted";
      description.textContent = translateKey("account_explorer.setup.alerts.advanced.conditions.help");
      heading.appendChild(title);
      heading.appendChild(description);
      section.appendChild(heading);

      section.appendChild(renderAdvancedGroup(alert, alert.advanced.root, { depth: 0, isRoot: true }));
      return section;
    }

    function serializeAdvancedCondition(condition, aliasById) {
      const entityAlias = aliasById.get(condition.entityId);
      const field = typeof condition.field === "string" ? condition.field.trim() : "";
      const operator = normalizeOperator(condition.operator);
      if (!entityAlias || !field || !operator) {
        return null;
      }
      const valueType = condition.valueType === ADVANCED_VALUE_TYPE_ENTITY ? ADVANCED_VALUE_TYPE_ENTITY : ADVANCED_VALUE_TYPE_VALUE;
      if (valueType === ADVANCED_VALUE_TYPE_ENTITY) {
        if (!ADVANCED_ENTITY_COMPARISON_OPERATORS.has(operator)) {
          return null;
        }
        const targetAlias = aliasById.get(condition.targetEntityId);
        const targetField = typeof condition.targetField === "string" ? condition.targetField.trim() : "";
        if (!targetAlias || !targetField) {
          return null;
        }
        return {
          type: "condition",
          entity: entityAlias,
          field,
          operator,
          valueType: "entity",
          targetEntity: targetAlias,
          targetField,
        };
      }
      const needsValue = operatorRequiresValue(operator);
      let value = typeof condition.value === "string" ? condition.value.trim() : "";
      if (needsValue && !value) {
        return null;
      }
      const entry = {
        type: "condition",
        entity: entityAlias,
        field,
        operator,
        valueType: "value",
      };
      if (needsValue) {
        entry.value = value;
      }
      return entry;
    }

    function serializeAdvancedGroup(group, aliasById) {
      if (!group || typeof group !== "object") {
        return null;
      }
      const operator = group.operator === "or" ? "or" : "and";
      const children = Array.isArray(group.children) ? group.children : [];
      const serializedChildren = [];
      children.forEach((child) => {
        if (!child || typeof child !== "object") {
          return;
        }
        if (child.type === "group") {
          const nested = serializeAdvancedGroup(child, aliasById);
          if (nested) {
            serializedChildren.push(nested);
          }
        } else if (child.type === "condition") {
          const serializedCondition = serializeAdvancedCondition(child, aliasById);
          if (serializedCondition) {
            serializedChildren.push(serializedCondition);
          }
        }
      });
      if (!serializedChildren.length) {
        return null;
      }
      return {
        type: "group",
        operator,
        children: serializedChildren,
      };
    }

    function serializeAdvancedDefinition(alert) {
      if (!alert || !alert.advanced) {
        return null;
      }
      const advanced = alert.advanced;
      if (!Array.isArray(advanced.entities) || !advanced.entities.length || !advanced.root) {
        return null;
      }
      const aliasById = new Map();
      advanced.entities.forEach((entity) => {
        if (!entity || typeof entity !== "object") {
          return;
        }
        const alias = typeof entity.alias === "string" ? entity.alias.trim() : "";
        const objectKey = typeof entity.object === "string" ? entity.object.trim() : "";
        if (!alias || !objectKey) {
          return;
        }
        if (!aliasById.has(entity.id)) {
          aliasById.set(entity.id, alias);
        }
      });
      if (!aliasById.size) {
        return null;
      }
      const usedAliases = new Set();
      const serializedEntities = [];
      advanced.entities.forEach((entity) => {
        if (!entity || typeof entity !== "object") {
          return;
        }
        const alias = aliasById.get(entity.id);
        const objectKey = typeof entity.object === "string" ? entity.object.trim() : "";
        if (!alias || !objectKey || usedAliases.has(alias)) {
          return;
        }
        const distinctFrom = Array.isArray(entity.distinctFrom)
          ? entity.distinctFrom
              .map((entityId) => aliasById.get(entityId))
              .filter((value) => typeof value === "string" && value && value !== alias)
          : [];
        const uniqueDistinct = [];
        distinctFrom.forEach((value) => {
          if (!uniqueDistinct.includes(value)) {
            uniqueDistinct.push(value);
          }
        });
        serializedEntities.push({ alias, object: objectKey, distinctFrom: uniqueDistinct });
        usedAliases.add(alias);
      });
      if (!serializedEntities.length) {
        return null;
      }
      const logic = serializeAdvancedGroup(advanced.root, aliasById);
      if (!logic) {
        return null;
      }
      return { entities: serializedEntities, logic };
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
        const modeWrapper = document.createElement("div");
        modeWrapper.className = "mb-3";
        const modeLabel = document.createElement("div");
        modeLabel.className = "form-label small mb-1";
        modeLabel.textContent = translateKey("account_explorer.setup.alerts.mode_label");
        const modeControls = document.createElement("div");
        modeControls.className = "d-flex flex-wrap gap-3";

        const basicOption = document.createElement("div");
        basicOption.className = "form-check form-check-inline";
        const basicInput = document.createElement("input");
        basicInput.className = "form-check-input";
        basicInput.type = "radio";
        basicInput.name = `account-explorer-alert-mode-${alert.id}`;
        basicInput.value = ALERT_MODE_BASIC;
        basicInput.id = `account-explorer-alert-mode-basic-${alert.id}`;
        basicInput.dataset.alertId = alert.id;
        basicInput.dataset.role = "alert-mode";
        basicInput.checked = alert.mode !== ALERT_MODE_ADVANCED;
        const basicLabel = document.createElement("label");
        basicLabel.className = "form-check-label";
        basicLabel.setAttribute("for", basicInput.id);
        basicLabel.textContent = translateKey("account_explorer.setup.alerts.mode_basic");
        basicOption.appendChild(basicInput);
        basicOption.appendChild(basicLabel);

        const advancedOption = document.createElement("div");
        advancedOption.className = "form-check form-check-inline";
        const advancedInput = document.createElement("input");
        advancedInput.className = "form-check-input";
        advancedInput.type = "radio";
        advancedInput.name = `account-explorer-alert-mode-${alert.id}`;
        advancedInput.value = ALERT_MODE_ADVANCED;
        advancedInput.id = `account-explorer-alert-mode-advanced-${alert.id}`;
        advancedInput.dataset.alertId = alert.id;
        advancedInput.dataset.role = "alert-mode";
        advancedInput.checked = alert.mode === ALERT_MODE_ADVANCED;
        const advancedLabel = document.createElement("label");
        advancedLabel.className = "form-check-label";
        advancedLabel.setAttribute("for", advancedInput.id);
        advancedLabel.textContent = translateKey("account_explorer.setup.alerts.mode_advanced");
        advancedOption.appendChild(advancedInput);
        advancedOption.appendChild(advancedLabel);

        modeControls.appendChild(basicOption);
        modeControls.appendChild(advancedOption);
        modeWrapper.appendChild(modeLabel);
        modeWrapper.appendChild(modeControls);
        card.appendChild(modeWrapper);

        const content = document.createElement("div");
        content.className = "d-flex flex-column gap-3";
        if (alert.mode === ALERT_MODE_ADVANCED) {
          ensureAdvancedEntityReferences(alert);
          content.appendChild(renderAdvancedEntitiesSection(alert, alertObjects));
          content.appendChild(renderAdvancedConditionsSection(alert));
        } else {
          content.appendChild(renderBasicAlertSection(alert, alertObjects));
        }

        card.appendChild(content);
        setupAlertList.appendChild(card);
      });
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
        const mode = alert.mode === ALERT_MODE_ADVANCED ? ALERT_MODE_ADVANCED : ALERT_MODE_BASIC;
        if (mode === ALERT_MODE_ADVANCED) {
          const definition = serializeAdvancedDefinition(alert);
          if (!definition) {
            return;
          }
          alerts.push({ id: alertId, label, mode, definition, filters: [] });
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
        alerts.push({ id: alertId, label, mode: ALERT_MODE_BASIC, filters });
        seen.add(alertId);
      });
      return alerts;
    }

    function handleAlertListClick(event) {
      const button = event.target.closest("button[data-action], button[data-role]");
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
        return;
      }
      const role = button.dataset.role;
      if (role === "add-advanced-entity") {
        if (!alert.advanced) {
          alert.advanced = createDefaultAdvancedDefinition();
        }
        alert.advanced.entities = Array.isArray(alert.advanced.entities) ? alert.advanced.entities : [];
        alert.advanced.entities.push(createAdvancedEntity());
        renderSetupAlerts();
        return;
      }
      if (role === "remove-advanced-entity") {
        const entityId = button.dataset.entityId;
        removeAdvancedEntity(alert, entityId);
        renderSetupAlerts();
        return;
      }
      if (role === "add-advanced-condition") {
        const groupId = button.dataset.groupId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (group) {
          group.children = Array.isArray(group.children) ? group.children : [];
          const defaultEntity = Array.isArray(alert.advanced?.entities) ? alert.advanced.entities[0] : null;
          const condition = createAdvancedCondition({
            entityId: defaultEntity ? defaultEntity.id : "",
          });
          group.children.push(condition);
        }
        renderSetupAlerts();
        return;
      }
      if (role === "add-advanced-group") {
        const groupId = button.dataset.groupId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (group) {
          group.children = Array.isArray(group.children) ? group.children : [];
          const defaultEntity = Array.isArray(alert.advanced?.entities) ? alert.advanced.entities[0] : null;
          const newGroup = createAdvancedGroup({
            children: [createAdvancedCondition({ entityId: defaultEntity ? defaultEntity.id : "" })],
          });
          group.children.push(newGroup);
        }
        renderSetupAlerts();
        return;
      }
      if (role === "remove-advanced-condition") {
        const groupId = button.dataset.groupId;
        const conditionId = button.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (group && Array.isArray(group.children)) {
          group.children = group.children.filter((child) => {
            if (!child || typeof child !== "object") {
              return false;
            }
            if (child.type === "condition") {
              return child.id !== conditionId;
            }
            return true;
          });
          if (!group.children.length) {
            const defaultEntity = Array.isArray(alert.advanced?.entities) ? alert.advanced.entities[0] : null;
            group.children.push(createAdvancedCondition({ entityId: defaultEntity ? defaultEntity.id : "" }));
          }
        }
        renderSetupAlerts();
        return;
      }
      if (role === "remove-advanced-group") {
        const groupId = button.dataset.groupId;
        removeAdvancedGroup(alert, groupId);
        renderSetupAlerts();
      }
    }

    function handleAlertListChange(event) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.dataset.role === "alert-mode") {
        const alertId = target.dataset.alertId;
        const alert = findAlertById(alertId);
        if (!alert) {
          return;
        }
        alert.mode = target.value === ALERT_MODE_ADVANCED ? ALERT_MODE_ADVANCED : ALERT_MODE_BASIC;
        if (alert.mode === ALERT_MODE_ADVANCED && !alert.advanced) {
          alert.advanced = createDefaultAdvancedDefinition();
        }
        renderSetupAlerts();
        return;
      }
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const alertId = target.dataset.alertId;
      const alert = findAlertById(alertId);
      if (!alert) {
        return;
      }
      const role = target.dataset.role;
      if (role === "alert-object") {
        const filterId = target.dataset.filterId;
        const filter = findAlertFilter(alert, filterId);
        if (!filter) {
          return;
        }
        filter.object = target.value;
        loadAlertFieldSuggestions(alertId, filterId);
        return;
      }
      if (role === "alert-operator") {
        const filterId = target.dataset.filterId;
        const filter = findAlertFilter(alert, filterId);
        if (!filter) {
          return;
        }
        filter.operator = normalizeOperator(target.value);
        updateAlertFilterValueState(alertId, filterId);
        return;
      }
      if (role === "advanced-entity-object") {
        const entityId = target.dataset.entityId;
        const entity = findAdvancedEntity(alert, entityId);
        if (!entity) {
          return;
        }
        entity.object = target.value;
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-entity-distinct") {
        const entityId = target.dataset.entityId;
        const entity = findAdvancedEntity(alert, entityId);
        if (!entity) {
          return;
        }
        const selected = Array.from(target.selectedOptions || []).map((option) => option.value);
        entity.distinctFrom = selected.filter((value) => typeof value === "string" && value && value !== entity.id);
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-group-operator") {
        const groupId = target.dataset.groupId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group) {
          return;
        }
        group.operator = target.value === "or" ? "or" : "and";
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-condition-entity") {
        const groupId = target.dataset.groupId;
        const conditionId = target.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group || !Array.isArray(group.children)) {
          return;
        }
        const condition = group.children.find((child) => child && child.type === "condition" && child.id === conditionId);
        if (!condition) {
          return;
        }
        condition.entityId = target.value;
        if (!condition.entityId) {
          condition.field = "";
        }
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-condition-operator") {
        const groupId = target.dataset.groupId;
        const conditionId = target.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group || !Array.isArray(group.children)) {
          return;
        }
        const condition = group.children.find((child) => child && child.type === "condition" && child.id === conditionId);
        if (!condition) {
          return;
        }
        condition.operator = normalizeOperator(target.value);
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-condition-value-type") {
        const groupId = target.dataset.groupId;
        const conditionId = target.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group || !Array.isArray(group.children)) {
          return;
        }
        const condition = group.children.find((child) => child && child.type === "condition" && child.id === conditionId);
        if (!condition) {
          return;
        }
        condition.valueType = target.value === ADVANCED_VALUE_TYPE_ENTITY ? ADVANCED_VALUE_TYPE_ENTITY : ADVANCED_VALUE_TYPE_VALUE;
        if (condition.valueType === ADVANCED_VALUE_TYPE_ENTITY) {
          condition.value = "";
          if (!ADVANCED_ENTITY_COMPARISON_OPERATORS.has(condition.operator)) {
            condition.operator = "equals";
          }
        } else {
          condition.targetEntityId = "";
          condition.targetField = "";
        }
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-condition-target-entity") {
        const groupId = target.dataset.groupId;
        const conditionId = target.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group || !Array.isArray(group.children)) {
          return;
        }
        const condition = group.children.find((child) => child && child.type === "condition" && child.id === conditionId);
        if (!condition) {
          return;
        }
        condition.targetEntityId = target.value;
        if (!condition.targetEntityId) {
          condition.targetField = "";
        }
        renderSetupAlerts();
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
      if (role === "alert-field" || role === "alert-value") {
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
        return;
      }
      if (role === "advanced-entity-alias") {
        const entityId = target.dataset.entityId;
        const entity = findAdvancedEntity(alert, entityId);
        if (!entity) {
          return;
        }
        entity.alias = target.value;
        renderSetupAlerts();
        return;
      }
      if (role === "advanced-condition-field" || role === "advanced-condition-value" || role === "advanced-condition-target-field") {
        const groupId = target.dataset.groupId;
        const conditionId = target.dataset.conditionId;
        const group = findAdvancedGroupById(alert.advanced?.root, groupId);
        if (!group || !Array.isArray(group.children)) {
          return;
        }
        const condition = group.children.find((child) => child && child.type === "condition" && child.id === conditionId);
        if (!condition) {
          return;
        }
        if (role === "advanced-condition-field") {
          condition.field = target.value;
          return;
        }
        if (role === "advanced-condition-value") {
          condition.value = target.value;
          return;
        }
        if (role === "advanced-condition-target-field") {
          condition.targetField = target.value;
        }
      }
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
