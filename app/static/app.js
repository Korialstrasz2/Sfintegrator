function createDefaultComposerState() {
  return {
    step: 0,
    template: "custom",
    baseObject: "",
    alias: "",
    fields: [],
    customFields: [],
    childQueries: [],
    conditions: [],
    orderBy: [],
    limit: "",
  };
}

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
  queryComposer: createDefaultComposerState(),
};

const STORAGE_PREFIX = "sfint";
const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}.settings`,
  savedQueries: `${STORAGE_PREFIX}.savedQueries`,
  selectedOrg: `${STORAGE_PREFIX}.selectedOrg`,
  queryDraft: `${STORAGE_PREFIX}.queryDraft`,
};

const COMPOSER_TOTAL_STEPS = 4;

const queryComposerTemplates = [
  {
    id: "custom",
    titleKey: "index.query.composer.steps.templates.options.custom.title",
    descriptionKey: "index.query.composer.steps.templates.options.custom.description",
  },
  {
    id: "basic",
    titleKey: "index.query.composer.steps.templates.options.basic.title",
    descriptionKey: "index.query.composer.steps.templates.options.basic.description",
  },
  {
    id: "recent",
    titleKey: "index.query.composer.steps.templates.options.recent.title",
    descriptionKey: "index.query.composer.steps.templates.options.recent.description",
  },
  {
    id: "childSummary",
    titleKey: "index.query.composer.steps.templates.options.child_summary.title",
    descriptionKey: "index.query.composer.steps.templates.options.child_summary.description",
  },
];

const COMPOSER_OPERATORS = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "NOT LIKE",
  "IN",
  "NOT IN",
  "INCLUDES",
  "EXCLUDES",
  "STARTS WITH",
  "ENDS WITH",
  "CONTAINS",
  "IS NULL",
  "IS NOT NULL",
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

function updateComposerState(patch = null) {
  if (patch && typeof patch === "object") {
    Object.assign(state.queryComposer, patch);
  }
  renderComposerStepIndicators();
  renderComposerSteps();
  renderComposerTemplates();
  renderComposerChildQueries();
  renderComposerFieldList();
  renderComposerSelectedFields();
  renderComposerConditions();
  renderComposerOrderBy();
  renderComposerPreview();
  updateComposerFieldOptions();
}

function resetComposerState() {
  state.queryComposer = createDefaultComposerState();
  updateComposerState();
}

function createComposerId(prefix) {
  try {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (error) {
    // continue with fallback
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setComposerStep(step = 0) {
  const value = Math.max(0, Math.min(COMPOSER_TOTAL_STEPS - 1, Number(step)));
  if (state.queryComposer.step !== value) {
    state.queryComposer.step = value;
    renderComposerStepIndicators();
    renderComposerSteps();
  }
}

function getComposerAvailableFields(objectName = state.queryComposer.baseObject) {
  if (!objectName) {
    return [];
  }
  const fields = state.metadata.fields?.[objectName];
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.map((field) => field.name).filter(Boolean);
}

function updateComposerFieldOptions() {
  const datalist = document.getElementById("query-composer-field-options");
  if (!datalist) {
    return;
  }
  datalist.innerHTML = "";
  const values = new Set([
    ...getComposerAvailableFields(),
    ...state.queryComposer.fields,
    ...state.queryComposer.customFields,
  ]);
  values.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  });
}

function renderComposerStepIndicators() {
  const container = document.getElementById("query-composer-step-indicators");
  if (!container) {
    return;
  }
  const current = state.queryComposer.step;
  container.querySelectorAll(".composer-step-indicator").forEach((stepEl) => {
    const stepIndex = Number(stepEl.dataset.step);
    if (Number.isNaN(stepIndex)) {
      return;
    }
    stepEl.classList.toggle("active", stepIndex === current);
    stepEl.classList.toggle("completed", stepIndex < current);
  });
}

function renderComposerSteps() {
  const container = document.getElementById("query-composer-steps");
  if (!container) {
    return;
  }
  const current = state.queryComposer.step;
  container.querySelectorAll(".composer-step").forEach((stepEl) => {
    const stepIndex = Number(stepEl.dataset.step);
    if (Number.isNaN(stepIndex)) {
      return;
    }
    stepEl.classList.toggle("active", stepIndex === current);
    stepEl.classList.toggle("d-none", stepIndex !== current);
  });
  const backButton = document.querySelector("[data-composer-action='back']");
  if (backButton) {
    backButton.disabled = current === 0;
  }
  const nextButton = document.querySelector("[data-composer-action='next']");
  if (nextButton) {
    nextButton.classList.toggle("d-none", current === COMPOSER_TOTAL_STEPS - 1);
  }
  const insertButton = document.querySelector("[data-composer-action='insert']");
  if (insertButton) {
    insertButton.classList.toggle("d-none", current !== COMPOSER_TOTAL_STEPS - 1);
  }
}

function renderComposerTemplates() {
  const container = document.getElementById("query-composer-template-options");
  if (!container) {
    return;
  }
  const current = state.queryComposer.template;
  container.querySelectorAll("[data-template-id]").forEach((card) => {
    const isActive = card.dataset.templateId === current;
    card.classList.toggle("active", isActive);
    card.setAttribute("aria-selected", String(isActive));
  });
}

function normalizeFieldList(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyComposerTemplateDefaults(options = {}) {
  const template = queryComposerTemplates.find((item) => item.id === state.queryComposer.template);
  if (!template) {
    return;
  }
  const objectName = state.queryComposer.baseObject;
  const availableFields = getComposerAvailableFields(objectName);
  if (!objectName && template.id !== "custom") {
    return;
  }

  const defaults = {
    fields: [],
    customFields: [],
    childQueries: [],
    conditions: [],
    orderBy: [],
    limit: "",
  };

  if (template.id === "basic") {
    const preferred = ["Id", "Name", "CreatedDate", "LastModifiedDate"];
    defaults.fields = preferred.filter((field) => availableFields.includes(field));
    if (!defaults.fields.length && availableFields.length) {
      defaults.fields = availableFields.slice(0, Math.min(4, availableFields.length));
    }
  } else if (template.id === "recent") {
    const baseFields = ["Id", "Name", "LastModifiedDate", "LastModifiedById"];
    defaults.fields = baseFields.filter((field) => availableFields.includes(field));
    if (!defaults.fields.length && availableFields.length) {
      defaults.fields = availableFields.slice(0, Math.min(5, availableFields.length));
    }
    if (availableFields.includes("LastModifiedDate")) {
      defaults.orderBy = [
        {
          id: createComposerId("order"),
          field: "LastModifiedDate",
          direction: "DESC",
        },
      ];
    }
    defaults.limit = "100";
  } else if (template.id === "childSummary") {
    defaults.fields = availableFields.includes("Id") ? ["Id"] : [];
    if (availableFields.includes("Name")) {
      defaults.fields.push("Name");
    }
    defaults.childQueries = [
      {
        id: createComposerId("child"),
        relationshipName: "ChildRelationship",
        fields: ["Id", "Name"],
        conditions: "",
        orderBy: "",
        limit: "",
      },
    ];
  }

  if (options?.preserveManualFields) {
    defaults.fields = Array.from(new Set([...(defaults.fields || []), ...state.queryComposer.fields]));
    defaults.customFields = Array.from(
      new Set([...(defaults.customFields || []), ...state.queryComposer.customFields])
    );
  }

  state.queryComposer.fields = defaults.fields || [];
  state.queryComposer.customFields = defaults.customFields || [];
  state.queryComposer.childQueries = defaults.childQueries || [];
  state.queryComposer.conditions = defaults.conditions || state.queryComposer.conditions || [];
  state.queryComposer.orderBy = defaults.orderBy || [];
  state.queryComposer.limit = defaults.limit || state.queryComposer.limit || "";
  updateComposerFieldOptions();
  renderComposerChildQueries();
  renderComposerFieldList();
  renderComposerSelectedFields();
  renderComposerOrderBy();
  renderComposerPreview();
}

function renderComposerChildQueries() {
  const list = document.getElementById("query-composer-child-list");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!state.queryComposer.childQueries.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("index.query.composer.steps.object.child_empty");
    list.appendChild(empty);
    return;
  }

  state.queryComposer.childQueries.forEach((child) => {
    const item = document.createElement("div");
    item.className = "composer-chip";
    const title = document.createElement("div");
    title.className = "composer-chip-title";
    title.textContent = child.relationshipName;
    item.appendChild(title);
    const details = document.createElement("div");
    details.className = "composer-chip-description";
    const fields = child.fields.join(", ");
    const parts = [fields];
    if (child.conditions) {
      parts.push(`${translate("index.query.composer.steps.object.labels.where")}: ${child.conditions}`);
    }
    if (child.orderBy) {
      parts.push(`${translate("index.query.composer.steps.filters.labels.order_by")}: ${child.orderBy}`);
    }
    if (child.limit) {
      parts.push(`${translate("index.query.composer.steps.filters.labels.limit")}: ${child.limit}`);
    }
    details.textContent = parts.filter(Boolean).join(" • ");
    item.appendChild(details);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-sm btn-outline-danger";
    removeButton.dataset.childId = child.id;
    removeButton.textContent = translate("index.query.composer.common.remove_button");
    removeButton.addEventListener("click", () => {
      state.queryComposer.childQueries = state.queryComposer.childQueries.filter((entry) => entry.id !== child.id);
      renderComposerChildQueries();
      renderComposerPreview();
    });
    item.appendChild(removeButton);
    list.appendChild(item);
  });
}

function renderComposerFieldList() {
  const container = document.getElementById("query-composer-field-options-container");
  if (!container) {
    return;
  }
  const search = document.getElementById("query-composer-field-search");
  const filter = search ? search.value.trim().toLowerCase() : "";
  const fields = getComposerAvailableFields();
  container.innerHTML = "";
  if (!fields.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("index.query.composer.steps.fields.empty");
    container.appendChild(empty);
    return;
  }

  fields
    .filter((field) => !filter || field.toLowerCase().includes(filter))
    .slice(0, 150)
    .forEach((field) => {
      const id = `composer-field-${field.replace(/[^a-z0-9]/gi, "-")}`;
      const wrapper = document.createElement("div");
      wrapper.className = "form-check";
      const input = document.createElement("input");
      input.className = "form-check-input";
      input.type = "checkbox";
      input.id = id;
      input.value = field;
      input.checked = state.queryComposer.fields.includes(field);
      input.addEventListener("change", (event) => {
        if (event.target.checked) {
          if (!state.queryComposer.fields.includes(field)) {
            state.queryComposer.fields.push(field);
          }
        } else {
          state.queryComposer.fields = state.queryComposer.fields.filter((item) => item !== field);
        }
        renderComposerSelectedFields();
        renderComposerPreview();
        updateComposerFieldOptions();
      });
      const label = document.createElement("label");
      label.className = "form-check-label";
      label.htmlFor = id;
      label.textContent = field;
      wrapper.appendChild(input);
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
}

function renderComposerSelectedFields() {
  const container = document.getElementById("query-composer-selected-fields");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const allFields = [...state.queryComposer.fields, ...state.queryComposer.customFields];
  if (!allFields.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("index.query.composer.steps.fields.selected_empty");
    container.appendChild(empty);
    return;
  }
  allFields.forEach((field) => {
    const chip = document.createElement("div");
    chip.className = "composer-chip";
    chip.textContent = field;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-sm btn-outline-danger";
    remove.textContent = translate("index.query.composer.common.remove_button");
    remove.addEventListener("click", () => {
      state.queryComposer.fields = state.queryComposer.fields.filter((item) => item !== field);
      state.queryComposer.customFields = state.queryComposer.customFields.filter((item) => item !== field);
      renderComposerFieldList();
      renderComposerSelectedFields();
      renderComposerPreview();
      updateComposerFieldOptions();
    });
    chip.appendChild(remove);
    container.appendChild(chip);
  });
}

function renderComposerConditions() {
  const list = document.getElementById("query-composer-condition-list");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!state.queryComposer.conditions.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("index.query.composer.steps.filters.conditions_empty");
    list.appendChild(empty);
    return;
  }
  state.queryComposer.conditions.forEach((condition) => {
    const chip = document.createElement("div");
    chip.className = "composer-chip";
    chip.textContent = condition.label;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-sm btn-outline-danger";
    remove.dataset.conditionId = condition.id;
    remove.textContent = translate("index.query.composer.common.remove_button");
    remove.addEventListener("click", () => {
      state.queryComposer.conditions = state.queryComposer.conditions.filter((item) => item.id !== condition.id);
      renderComposerConditions();
      renderComposerPreview();
    });
    chip.appendChild(remove);
    list.appendChild(chip);
  });
}

function renderComposerOrderBy() {
  const list = document.getElementById("query-composer-order-list");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!state.queryComposer.orderBy.length) {
    const empty = document.createElement("p");
    empty.className = "text-muted small mb-0";
    empty.textContent = translate("index.query.composer.steps.filters.order_empty");
    list.appendChild(empty);
    return;
  }
  state.queryComposer.orderBy.forEach((entry) => {
    const chip = document.createElement("div");
    chip.className = "composer-chip";
    chip.textContent = `${entry.field} ${entry.direction || "ASC"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-sm btn-outline-danger";
    remove.dataset.orderId = entry.id;
    remove.textContent = translate("index.query.composer.common.remove_button");
    remove.addEventListener("click", () => {
      state.queryComposer.orderBy = state.queryComposer.orderBy.filter((item) => item.id !== entry.id);
      renderComposerOrderBy();
      renderComposerPreview();
    });
    chip.appendChild(remove);
    list.appendChild(chip);
  });
}

function buildComposerChildQuery(child) {
  if (!child?.relationshipName || !Array.isArray(child.fields) || !child.fields.length) {
    return null;
  }
  const parts = [`SELECT ${child.fields.join(", ")}`, `FROM ${child.relationshipName}`];
  if (child.conditions) {
    parts.push(`WHERE ${child.conditions}`);
  }
  if (child.orderBy) {
    parts.push(`ORDER BY ${child.orderBy}`);
  }
  if (child.limit) {
    parts.push(`LIMIT ${child.limit}`);
  }
  return `(${parts.join(" ")})`;
}

function buildComposerQuery() {
  const objectName = state.queryComposer.baseObject;
  if (!objectName) {
    return "";
  }
  const selectFields = [...state.queryComposer.fields, ...state.queryComposer.customFields];
  const childParts = state.queryComposer.childQueries
    .map((child) => buildComposerChildQuery(child))
    .filter(Boolean);
  const fields = [...selectFields, ...childParts].filter(Boolean);
  if (!fields.length) {
    fields.push("Id");
  }
  const lines = [`SELECT ${fields.join(", ")}`, `FROM ${objectName}`];
  if (state.queryComposer.alias) {
    lines[1] = `${lines[1]} ${state.queryComposer.alias}`;
  }
  if (state.queryComposer.conditions.length) {
    const whereClause = state.queryComposer.conditions.map((condition) => condition.value).join(" AND ");
    lines.push(`WHERE ${whereClause}`);
  }
  if (state.queryComposer.orderBy.length) {
    const orderClause = state.queryComposer.orderBy
      .map((entry) => `${entry.field} ${entry.direction || "ASC"}`.trim())
      .join(", ");
    lines.push(`ORDER BY ${orderClause}`);
  }
  if (state.queryComposer.limit) {
    lines.push(`LIMIT ${state.queryComposer.limit}`);
  }
  return lines.join("\n");
}

function renderComposerPreview() {
  const preview = document.getElementById("query-composer-preview");
  if (!preview) {
    return;
  }
  const query = buildComposerQuery();
  preview.textContent = query || translate("index.query.composer.preview_empty");
}

function insertComposerQuery() {
  const query = buildComposerQuery();
  if (!query) {
    showToast(translate("frontend.toast.composer_select_field"), "warning");
    return;
  }
  const textarea = document.getElementById("soql-query");
  if (!textarea) {
    return;
  }
  textarea.value = query;
  applyKeywordFormatting(textarea, { preserveCursor: false });
  refreshQueryEditorState();
  saveQueryDraftToStorage(textarea.value);
  const modalElement = document.getElementById("query-composer-modal");
  if (modalElement) {
    const modal = bootstrap.Modal.getInstance(modalElement);
    modal?.hide();
  }
  showToast(translate("frontend.toast.composer_inserted"), "success");
}

function handleComposerNextStep() {
  const step = state.queryComposer.step;
  if (step === 1 && !state.queryComposer.baseObject) {
    showToast(translate("frontend.toast.composer_select_object"), "warning");
    return;
  }
  if (step === 2) {
    if (!state.queryComposer.fields.length && !state.queryComposer.customFields.length) {
      showToast(translate("frontend.toast.composer_select_field"), "warning");
      return;
    }
  }
  setComposerStep(step + 1);
}

function handleComposerAddChild() {
  const nameInput = document.getElementById("query-composer-child-name");
  const fieldsInput = document.getElementById("query-composer-child-fields");
  if (!nameInput || !fieldsInput) {
    return;
  }
  const relationshipName = nameInput.value.trim();
  const fields = normalizeFieldList(fieldsInput.value);
  if (!relationshipName || !fields.length) {
    showToast(translate("frontend.toast.composer_child_invalid"), "warning");
    return;
  }
  const conditionsInput = document.getElementById("query-composer-child-conditions");
  const orderInput = document.getElementById("query-composer-child-order");
  const limitInput = document.getElementById("query-composer-child-limit");
  state.queryComposer.childQueries.push({
    id: createComposerId("child"),
    relationshipName,
    fields,
    conditions: conditionsInput?.value.trim() || "",
    orderBy: orderInput?.value.trim() || "",
    limit: limitInput?.value.trim() || "",
  });
  nameInput.value = "";
  fieldsInput.value = "";
  if (conditionsInput) conditionsInput.value = "";
  if (orderInput) orderInput.value = "";
  if (limitInput) limitInput.value = "";
  renderComposerChildQueries();
  renderComposerPreview();
}

function handleComposerAddCustomField() {
  const input = document.getElementById("query-composer-custom-field");
  if (!input) {
    return;
  }
  const value = input.value.trim();
  if (!value) {
    return;
  }
  if (!state.queryComposer.customFields.includes(value) && !state.queryComposer.fields.includes(value)) {
    state.queryComposer.customFields.push(value);
    renderComposerSelectedFields();
    renderComposerPreview();
    updateComposerFieldOptions();
  }
  input.value = "";
}

function handleComposerAddCondition() {
  const fieldInput = document.getElementById("query-composer-condition-field");
  const operatorSelect = document.getElementById("query-composer-condition-operator");
  const valueInput = document.getElementById("query-composer-condition-value");
  if (!fieldInput || !operatorSelect || !valueInput) {
    return;
  }
  const field = fieldInput.value.trim();
  const operator = operatorSelect.value.trim();
  let rawValue = valueInput.value.trim();
  if (!field || !operator) {
    showToast(translate("frontend.toast.composer_condition_invalid"), "warning");
    return;
  }
  const operatorsWithoutValue = new Set(["IS NULL", "IS NOT NULL"]);
  if (!rawValue && !operatorsWithoutValue.has(operator)) {
    showToast(translate("frontend.toast.composer_condition_invalid"), "warning");
    return;
  }
  const requiresList = new Set(["IN", "NOT IN"]);
  if (requiresList.has(operator)) {
    const values = normalizeFieldList(rawValue);
    rawValue = values.length ? `(${values.map((val) => `'${val}'`).join(", ")})` : "";
  } else if (!operatorsWithoutValue.has(operator)) {
    if (!/^\d+(\.\d+)?$/.test(rawValue) && !/^'.*'$/.test(rawValue) && !/^".*"$/.test(rawValue)) {
      rawValue = `'${rawValue}'`;
    }
  }
  const conditionText = operatorsWithoutValue.has(operator)
    ? `${field} ${operator}`
    : `${field} ${operator} ${rawValue}`;
  const id = createComposerId("condition");
  state.queryComposer.conditions.push({
    id,
    field,
    operator,
    value: conditionText,
    label: conditionText,
  });
  fieldInput.value = "";
  operatorSelect.value = "";
  valueInput.value = "";
  renderComposerConditions();
  renderComposerPreview();
}

function handleComposerAddOrder() {
  const fieldInput = document.getElementById("query-composer-order-field");
  const directionSelect = document.getElementById("query-composer-order-direction");
  if (!fieldInput || !directionSelect) {
    return;
  }
  const field = fieldInput.value.trim();
  const direction = directionSelect.value.trim() || "ASC";
  if (!field) {
    showToast(translate("frontend.toast.composer_order_invalid"), "warning");
    return;
  }
  state.queryComposer.orderBy.push({
    id: createComposerId("order"),
    field,
    direction,
  });
  fieldInput.value = "";
  directionSelect.value = "ASC";
  renderComposerOrderBy();
  renderComposerPreview();
}

function handleComposerLimitChange() {
  const input = document.getElementById("query-composer-limit");
  if (!input) {
    return;
  }
  const value = input.value.trim();
  state.queryComposer.limit = value;
  renderComposerPreview();
}

function populateComposerObjects() {
  const datalist = document.getElementById("query-composer-object-options");
  if (!datalist) {
    return;
  }
  datalist.innerHTML = "";
  if (!Array.isArray(state.metadata.objects) || !state.metadata.objects.length) {
    return;
  }
  state.metadata.objects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach((object) => {
      const option = document.createElement("option");
      option.value = object.name;
      option.label = object.label || object.name;
      datalist.appendChild(option);
    });
}

function openQueryComposerModal() {
  if (!state.selectedOrg) {
    showToast(translate("frontend.toast.composer_requires_org"), "warning");
    return;
  }
  populateComposerObjects();
  updateComposerFieldOptions();
  renderComposerStepIndicators();
  renderComposerSteps();
  renderComposerTemplates();
  renderComposerChildQueries();
  renderComposerFieldList();
  renderComposerSelectedFields();
  renderComposerConditions();
  renderComposerOrderBy();
  renderComposerPreview();
  const modalElement = document.getElementById("query-composer-modal");
  if (!modalElement) {
    return;
  }
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  modal.show();
}

function initializeQueryComposer() {
  const openButton = document.getElementById("open-query-composer");
  const modalElement = document.getElementById("query-composer-modal");
  if (!openButton || !modalElement) {
    return;
  }

  openButton.addEventListener("click", () => {
    if (!state.metadata.objects.length && state.selectedOrg) {
      loadMetadataForSelectedOrg();
    }
    openQueryComposerModal();
  });

  modalElement.addEventListener("show.bs.modal", () => {
    if (!state.queryComposer.baseObject && state.metadata.selectedObject) {
      state.queryComposer.baseObject = state.metadata.selectedObject;
      applyComposerTemplateDefaults({ preserveManualFields: true });
    }
    const objectInputEl = document.getElementById("query-composer-object");
    if (objectInputEl) {
      objectInputEl.value = state.queryComposer.baseObject || "";
    }
    const aliasInputEl = document.getElementById("query-composer-alias");
    if (aliasInputEl) {
      aliasInputEl.value = state.queryComposer.alias || "";
    }
    renderComposerPreview();
  });

  modalElement.addEventListener("hidden.bs.modal", () => {
    resetComposerState();
    [
      "query-composer-object",
      "query-composer-alias",
      "query-composer-child-name",
      "query-composer-child-fields",
      "query-composer-child-conditions",
      "query-composer-child-order",
      "query-composer-child-limit",
      "query-composer-field-search",
      "query-composer-custom-field",
      "query-composer-condition-field",
      "query-composer-condition-value",
      "query-composer-order-field",
      "query-composer-limit",
    ].forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = "";
      }
    });
    const operatorSelect = document.getElementById("query-composer-condition-operator");
    if (operatorSelect) {
      operatorSelect.value = "";
    }
    const directionSelect = document.getElementById("query-composer-order-direction");
    if (directionSelect) {
      directionSelect.value = "ASC";
    }
  });

  document
    .getElementById("query-composer-template-options")
    ?.querySelectorAll("[data-template-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.queryComposer.template = button.dataset.templateId;
        renderComposerTemplates();
        applyComposerTemplateDefaults();
      });
    });

  const objectInput = document.getElementById("query-composer-object");
  if (objectInput) {
    objectInput.addEventListener("change", async () => {
      const objectName = objectInput.value.trim();
      state.queryComposer.baseObject = objectName;
      if (objectName) {
        await loadFieldsForObject(objectName);
        applyComposerTemplateDefaults();
      }
      renderComposerFieldList();
      renderComposerSelectedFields();
      renderComposerPreview();
    });
  }

  const aliasInput = document.getElementById("query-composer-alias");
  if (aliasInput) {
    aliasInput.addEventListener("input", () => {
      state.queryComposer.alias = aliasInput.value.trim();
      renderComposerPreview();
    });
  }

  const fieldSearch = document.getElementById("query-composer-field-search");
  if (fieldSearch) {
    fieldSearch.addEventListener("input", () => {
      renderComposerFieldList();
    });
  }

  const addChildButton = document.getElementById("query-composer-add-child");
  if (addChildButton) {
    addChildButton.addEventListener("click", handleComposerAddChild);
  }

  const addCustomFieldButton = document.getElementById("query-composer-add-custom-field");
  if (addCustomFieldButton) {
    addCustomFieldButton.addEventListener("click", handleComposerAddCustomField);
  }

  const addConditionButton = document.getElementById("query-composer-add-condition");
  if (addConditionButton) {
    addConditionButton.addEventListener("click", handleComposerAddCondition);
  }

  const addOrderButton = document.getElementById("query-composer-add-order");
  if (addOrderButton) {
    addOrderButton.addEventListener("click", handleComposerAddOrder);
  }

  const limitInput = document.getElementById("query-composer-limit");
  if (limitInput) {
    limitInput.addEventListener("input", handleComposerLimitChange);
  }

  const nextButton = document.querySelector("[data-composer-action='next']");
  nextButton?.addEventListener("click", handleComposerNextStep);

  const backButton = document.querySelector("[data-composer-action='back']");
  backButton?.addEventListener("click", () => setComposerStep(state.queryComposer.step - 1));

  const insertButton = document.querySelector("[data-composer-action='insert']");
  insertButton?.addEventListener("click", insertComposerQuery);

  const templateOptions = document.getElementById("query-composer-template-options");
  if (templateOptions) {
    templateOptions.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const target = event.target.closest("[data-template-id]");
      if (!target) {
        return;
      }
      event.preventDefault();
      target.click();
    });
  }
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
    populateComposerObjects();
  } catch (error) {
    const message = error instanceof Error ? error.message : translate("toast.metadata_fetch_failed");
    showToast(message, "danger");
  } finally {
    showElement(loading, false);
    renderObjectList();
    populateComposerObjects();
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
