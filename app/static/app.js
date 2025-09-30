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
};

const FROM_REGEX = /\bFROM\s+([a-zA-Z0-9_.]+)/i;
const SELECT_REGEX = /(\bSELECT\s+)([\s\S]*?)(\s+FROM\b)/i;

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

function bindQueryEditor() {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  textarea.addEventListener("input", () => refreshQueryEditorState());
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

function updateFieldSuggestions() {
  const container = document.getElementById("query-field-suggestions");
  const list = document.getElementById("query-field-suggestions-list");
  if (!container || !list) return;
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const titleElement = container.querySelector(".suggestions-title");
  const query = textarea.value || "";
  const objectName = extractObjectNameFromQuery(query);

  const hideSuggestions = (label) => {
    list.innerHTML = "";
    showElement(container, false);
    if (titleElement) {
      const fallback = container.dataset.labelTitle || "";
      titleElement.textContent = label ?? fallback;
    }
  };

  if (!state.selectedOrg || !objectName) {
    hideSuggestions(container.dataset.labelTitle || "");
    return;
  }

  const fields = state.metadata.fields[objectName] || [];
  if (!fields.length) {
    hideSuggestions(container.dataset.labelEmpty || container.dataset.labelTitle || "");
    return;
  }

  const selectedFields = getNormalizedSelectFieldSet(query);
  const suggestions = fields.filter(
    (field) => !selectedFields.has(field.name.toLowerCase())
  );

  if (!suggestions.length) {
    hideSuggestions(container.dataset.labelEmpty || container.dataset.labelTitle || "");
    return;
  }

  list.innerHTML = "";
  suggestions.slice(0, 12).forEach((field) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm btn-outline-primary";
    button.textContent = field.name;
    if (field.label && field.label !== field.name) {
      button.title = field.label;
    }
    button.addEventListener("click", () => addFieldToSelectClause(field.name));
    list.appendChild(button);
  });

  if (titleElement) {
    const title = container.dataset.labelTitle || "";
    titleElement.textContent = objectName ? `${title} (${objectName})` : title;
  }

  showElement(container, true);
}

function bindOrgSelection() {
  document.querySelectorAll(".org-select").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOrg = button.dataset.org;
      const label = button.querySelector("strong")?.textContent.trim() ?? button.textContent.trim();
      const selectedOrgInput = document.getElementById("selected-org");
      if (selectedOrgInput) {
        selectedOrgInput.value = label;
      }
      document.querySelectorAll(".org-select").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      loadMetadataForSelectedOrg();
    });
  });
}

function renderQueryResult(data) {
  const container = document.getElementById("query-result");
  if (!container) return;
  if (!data || !data.records || data.records.length === 0) {
    container.innerHTML = `<p class="text-muted">${translate("query.no_records")}</p>`;
    return;
  }
  const records = data.records;
  const columns = Object.keys(records[0]);
  const headerRow = columns.map((col) => `<th>${col}</th>`).join("");
  const rows = records
    .map((record) => `<tr>${columns.map((col) => `<td>${escapeHtml(record[col])}</td>`).join("")}</tr>`)
    .join("");

  container.innerHTML = `
    <table class="table table-striped">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
  refreshQueryEditorState();
}

function addClauseToQuery(clause) {
  const textarea = document.getElementById("soql-query");
  if (!textarea) return;
  const clauseUpper = clause.toUpperCase();
  if (textarea.value.toUpperCase().includes(clauseUpper)) {
    showToast(translate("toast.clause_exists", { clause }), "info");
    return;
  }
  insertIntoQuery(clause);
}

function bindSnippetButtons() {
  const limitButton = document.getElementById("add-limit");
  if (limitButton) {
    limitButton.addEventListener("click", () => addClauseToQuery("LIMIT 100"));
  }
  const orderByButton = document.getElementById("add-order-by");
  if (orderByButton) {
    orderByButton.addEventListener("click", () => addClauseToQuery("ORDER BY Created DESC"));
  }
}

function bindQueryForm() {
  const form = document.getElementById("query-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = document.getElementById("soql-query").value.trim();
    if (!state.selectedOrg) {
      showToast(translate("toast.select_org"), "warning");
      return;
    }
    if (!query) {
      showToast(translate("toast.enter_query"), "warning");
      return;
    }
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
      renderQueryResult(data);
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
  loadSavedQueries();
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

document.addEventListener("DOMContentLoaded", () => {
  bindOrgSelection();
  bindQueryForm();
  bindQueryEditor();
  bindOrgForm();
  bindSnippetButtons();
  initializeSavedQueries();
  initializeQueryHistory();
  initializeAutocomplete();
  loadMetadataForSelectedOrg();
});
