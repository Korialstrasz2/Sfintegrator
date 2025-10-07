(function () {
  function getTranslation(key, params = {}) {
    if (typeof translate === "function") {
      return translate(key, params);
    }
    return key;
  }

  function formatDate(value) {
    if (typeof formatTimestamp === "function") {
      return formatTimestamp(value);
    }
    return value || "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const cardsContainer = document.getElementById("data-import-cards");
    if (!cardsContainer) {
      return;
    }

    const objects = Array.isArray(window.DATA_IMPORT_OBJECTS)
      ? window.DATA_IMPORT_OBJECTS
      : [];
    let statusList = Array.isArray(window.DATA_IMPORT_STATUS)
      ? window.DATA_IMPORT_STATUS
      : [];
    let statusMap = new Map(statusList.map((item) => [item.key, item]));

    const objectSelect = document.getElementById("data-import-object");
    const fieldSelect = document.getElementById("data-import-field");
    const valueInput = document.getElementById("data-import-value");
    const suggestionsList = document.getElementById("data-import-suggestions");
    const resultContainer = document.getElementById("data-import-results");
    const resultPlaceholder = document.getElementById("data-import-placeholder");
    const resultCountBadge = document.getElementById("data-import-result-count");
    const searchForm = document.getElementById("data-import-search");
    const resetButton = document.getElementById("data-import-reset");

    let autocompleteTimeout = null;
    let currentGraph = null;
    let selectedObjectKey = null;
    let selectedRecordId = null;
    let matchKeySet = new Set();

    let objectsListEl = null;
    let recordListEl = null;
    let recordDetailsEl = null;

    function setStatus(list) {
      if (!Array.isArray(list)) {
        return;
      }
      statusList = list;
      statusMap = new Map(list.map((item) => [item.key, item]));
    }

    function getStatus(key) {
      return statusMap.get(key) || null;
    }

    function updateBadge(card, entry) {
      const badge = card.querySelector(".data-import-badge");
      if (!badge) return;
      if (entry?.loaded) {
        badge.textContent = getTranslation("data_import.upload.loaded_badge");
        badge.classList.remove("bg-secondary");
        badge.classList.add("bg-success");
      } else {
        badge.textContent = getTranslation("data_import.upload.optional");
        badge.classList.remove("bg-success");
        badge.classList.add("bg-secondary");
      }
    }

    function updateCard(objectKey) {
      const card = cardsContainer.querySelector(
        `.data-import-card[data-object="${objectKey}"]`
      );
      if (!card) {
        return;
      }
      const entry = getStatus(objectKey);
      updateBadge(card, entry);
      const emptyState = card.querySelector('.data-import-status[data-status="empty"]');
      const loadedState = card.querySelector('.data-import-status[data-status="loaded"]');
      if (!entry || !entry.loaded) {
        if (emptyState) emptyState.classList.remove("d-none");
        if (loadedState) loadedState.classList.add("d-none");
        return;
      }
      if (emptyState) emptyState.classList.add("d-none");
      if (loadedState) {
        loadedState.classList.remove("d-none");
        const fileNameEl = loadedState.querySelector(".data-import-file-name");
        const recordCountEl = loadedState.querySelector(".data-import-record-count");
        const updatedAtEl = loadedState.querySelector(".data-import-updated-at");
        if (fileNameEl) {
          fileNameEl.textContent = entry.filename || "";
        }
        if (recordCountEl) {
          recordCountEl.textContent = String(entry.recordCount || 0);
        }
        if (updatedAtEl) {
          updatedAtEl.textContent = formatDate(entry.updatedAt);
        }
      }
    }

    function updateAllCards() {
      objects.forEach((definition) => updateCard(definition.key));
    }

    function populateObjectSelect() {
      if (!objectSelect) {
        return;
      }
      const previousValue = objectSelect.value;
      objectSelect.innerHTML = "";
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = "";
      objectSelect.appendChild(placeholderOption);
      objects.forEach((definition) => {
        const entry = getStatus(definition.key);
        if (!entry || (!entry.loaded && !entry.recordCount)) {
          // Still include option but mark as disabled if nothing loaded.
        }
        const option = document.createElement("option");
        option.value = definition.key;
        const count = entry?.recordCount ?? 0;
        option.textContent = count
          ? `${definition.label} (${count})`
          : definition.label;
        option.disabled = !entry?.loaded;
        objectSelect.appendChild(option);
      });
      const previousOption = previousValue
        ? objectSelect.querySelector(`option[value="${previousValue}"]`)
        : null;
      if (previousOption && !previousOption.disabled) {
        objectSelect.value = previousValue;
        onObjectChange();
      } else {
        objectSelect.value = "";
        fieldSelect.value = "";
        fieldSelect.disabled = true;
      }
    }

    function refreshStatus() {
      fetch("/api/data-import/status")
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            throw new Error("status_failed");
          }
          setStatus(data);
          updateAllCards();
          populateObjectSelect();
        })
        .catch((error) => {
          const code = error instanceof Error ? error.message : "status_failed";
          showToast(
            getTranslation(`frontend.data_import.${code}`) ||
              getTranslation("frontend.data_import.status_failed"),
            "danger"
          );
        });
    }

    function lookupErrorMessage(code, fallbackKey) {
      if (!code) {
        return getTranslation(fallbackKey);
      }
      const translated = getTranslation(`frontend.data_import.errors.${code}`);
      if (translated && translated !== `frontend.data_import.errors.${code}`) {
        return translated;
      }
      return getTranslation(fallbackKey);
    }

    function handleUpload(input) {
      const objectKey = input.dataset.object;
      if (!objectKey) {
        return;
      }
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      const formData = new FormData();
      formData.append("object", objectKey);
      formData.append("file", file);
      input.disabled = true;
      fetch("/api/data-import/upload", {
        method: "POST",
        body: formData,
      })
        .then((response) =>
          response
            .json()
            .catch(() => ({ error: "invalid_file" }))
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            const message = lookupErrorMessage(data.code || data.error, "frontend.data_import.upload_failed");
            throw new Error(message);
          }
          if (Array.isArray(data.status)) {
            setStatus(data.status);
            updateAllCards();
            populateObjectSelect();
          }
          const definition = objects.find((item) => item.key === objectKey);
          const entry = getStatus(objectKey);
          const count = entry?.recordCount ?? 0;
          showToast(
            getTranslation("frontend.data_import.upload_success", {
              label: definition?.label || objectKey,
              count,
            })
          );
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : getTranslation("frontend.data_import.upload_failed");
          showToast(message, "danger");
        })
        .finally(() => {
          input.disabled = false;
          input.value = "";
        });
    }

    function handleRemove(button) {
      const card = button.closest(".data-import-card");
      if (!card) {
        return;
      }
      const objectKey = card.dataset.object;
      if (!objectKey) {
        return;
      }
      button.disabled = true;
      fetch("/api/data-import/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: objectKey }),
      })
        .then((response) =>
          response
            .json()
            .catch(() => ({ error: "remove_failed" }))
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            const message = lookupErrorMessage(data.error, "frontend.data_import.remove_failed");
            throw new Error(message);
          }
          if (Array.isArray(data.status)) {
            setStatus(data.status);
            updateAllCards();
            populateObjectSelect();
          }
          const definition = objects.find((item) => item.key === objectKey);
          showToast(
            getTranslation("frontend.data_import.remove_success", {
              label: definition?.label || objectKey,
            }),
            "info"
          );
          if (objectSelect.value === objectKey) {
            objectSelect.value = "";
            fieldSelect.innerHTML = "";
            fieldSelect.disabled = true;
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : getTranslation("frontend.data_import.remove_failed");
          showToast(message, "danger");
        })
        .finally(() => {
          button.disabled = false;
        });
    }

    function clearSuggestions() {
      if (!suggestionsList) return;
      suggestionsList.innerHTML = "";
    }

    function onObjectChange() {
      const objectKey = objectSelect.value;
      fieldSelect.innerHTML = "";
      fieldSelect.disabled = true;
      clearSuggestions();
      valueInput.value = "";
      if (!objectKey) {
        return;
      }
      fetch(`/api/data-import/fields?object=${encodeURIComponent(objectKey)}`)
        .then((response) =>
          response
            .json()
            .catch(() => ({ error: "fields_failed" }))
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok || !Array.isArray(data.fields)) {
            throw new Error(getTranslation("frontend.data_import.fields_failed"));
          }
          fieldSelect.innerHTML = "";
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "";
          fieldSelect.appendChild(placeholder);
          data.fields.forEach((field) => {
            const option = document.createElement("option");
            option.value = field;
            option.textContent = field;
            fieldSelect.appendChild(option);
          });
          fieldSelect.disabled = data.fields.length === 0;
          if (data.fields.length === 0) {
            showToast(getTranslation("frontend.data_import.fields_failed"), "warning");
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : getTranslation("frontend.data_import.fields_failed");
          showToast(message, "danger");
        });
    }

    function requestAutocomplete(term) {
      const objectKey = objectSelect.value;
      const fieldName = fieldSelect.value;
      if (!objectKey || !fieldName || term.length < 2) {
        clearSuggestions();
        return;
      }
      fetch(
        `/api/data-import/autocomplete?object=${encodeURIComponent(objectKey)}&field=${encodeURIComponent(fieldName)}&term=${encodeURIComponent(term)}`
      )
        .then((response) =>
          response
            .json()
            .catch(() => ({ error: "autocomplete_failed" }))
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok || !Array.isArray(data.values)) {
            throw new Error(getTranslation("frontend.data_import.autocomplete_failed"));
          }
          clearSuggestions();
          data.values.slice(0, 20).forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            suggestionsList.appendChild(option);
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : getTranslation("frontend.data_import.autocomplete_failed");
          showToast(message, "danger");
        });
    }

    function ensureResultsLayout() {
      resultContainer.innerHTML = "";
      const row = document.createElement("div");
      row.className = "row g-3";

      const objectsCol = document.createElement("div");
      objectsCol.className = "col-12 col-lg-4";
      objectsListEl = document.createElement("div");
      objectsListEl.className = "list-group data-import-object-list";
      objectsCol.appendChild(objectsListEl);

      const recordsCol = document.createElement("div");
      recordsCol.className = "col-12 col-lg-8";
      const panel = document.createElement("div");
      panel.className = "data-import-records-panel d-flex flex-column gap-3";
      recordListEl = document.createElement("div");
      recordListEl.className = "list-group data-import-record-list";
      recordDetailsEl = document.createElement("div");
      recordDetailsEl.className = "data-import-record-details card border-0";
      panel.appendChild(recordListEl);
      panel.appendChild(recordDetailsEl);
      recordsCol.appendChild(panel);

      row.appendChild(objectsCol);
      row.appendChild(recordsCol);
      resultContainer.appendChild(row);
    }

    function getObjectDefinition(objectKey) {
      return objects.find((item) => item.key === objectKey);
    }

    function getRecordLabel(record) {
      if (!record || !Array.isArray(record.fields)) {
        return record?.id || "";
      }
      for (const field of record.fields) {
        if (!field || typeof field.name !== "string") continue;
        if (field.name === "Id") continue;
        if (field.value && String(field.value).trim()) {
          return String(field.value).trim();
        }
      }
      return record.id || "";
    }

    function renderObjectList() {
      if (!objectsListEl || !currentGraph) return;
      objectsListEl.innerHTML = "";
      const availableKeys = new Set(Object.keys(currentGraph.objects || {}));
      const orderedKeys = objects
        .map((definition) => definition.key)
        .filter((key) => availableKeys.has(key));
      if (!orderedKeys.length) {
        const message = document.createElement("div");
        message.className = "text-muted small";
        message.textContent = getTranslation("data_import.results.placeholder");
        objectsListEl.appendChild(message);
        return;
      }
      orderedKeys.forEach((key) => {
        const objectData = currentGraph.objects[key];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "list-group-item list-group-item-action";
        button.dataset.object = key;
        if (key === selectedObjectKey) {
          button.classList.add("active");
        }
        const wrapper = document.createElement("div");
        wrapper.className = "d-flex justify-content-between align-items-center";
        const labelSpan = document.createElement("span");
        labelSpan.textContent = getObjectDefinition(key)?.label || key;
        const badge = document.createElement("span");
        badge.className = "badge bg-primary rounded-pill";
        badge.textContent = String(objectData.records.length);
        wrapper.appendChild(labelSpan);
        wrapper.appendChild(badge);
        button.appendChild(wrapper);
        button.addEventListener("click", () => {
          if (selectedObjectKey === key) {
            return;
          }
          selectedObjectKey = key;
          const records = objectData.records;
          selectedRecordId = records.length ? records[0].id : null;
          renderObjectList();
          renderRecordList();
          renderRecordDetails();
        });
        objectsListEl.appendChild(button);
      });
    }

    function renderRecordList() {
      if (!recordListEl) return;
      recordListEl.innerHTML = "";
      if (!selectedObjectKey || !currentGraph) {
        const message = document.createElement("div");
        message.className = "text-muted small";
        message.textContent = getTranslation("data_import.results.select_record");
        recordListEl.appendChild(message);
        return;
      }
      const objectData = currentGraph.objects[selectedObjectKey];
      if (!objectData || !objectData.records.length) {
        const message = document.createElement("div");
        message.className = "text-muted small";
        message.textContent = getTranslation("data_import.results.empty_object");
        recordListEl.appendChild(message);
        return;
      }
      objectData.records.forEach((record) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "list-group-item list-group-item-action";
        button.dataset.object = selectedObjectKey;
        button.dataset.id = record.id;
        if (record.id === selectedRecordId) {
          button.classList.add("active");
        }
        const wrapper = document.createElement("div");
        wrapper.className = "d-flex justify-content-between align-items-start gap-2";
        const textContainer = document.createElement("div");
        textContainer.className = "d-flex flex-column";
        const title = document.createElement("span");
        title.className = "fw-semibold";
        title.textContent = getRecordLabel(record);
        const subtitle = document.createElement("span");
        subtitle.className = "text-muted small";
        subtitle.textContent = record.id;
        textContainer.appendChild(title);
        textContainer.appendChild(subtitle);
        wrapper.appendChild(textContainer);
        if (matchKeySet.has(`${selectedObjectKey}:${record.id}`)) {
          const matchBadge = document.createElement("span");
          matchBadge.className = "badge bg-info text-dark";
          matchBadge.textContent = getTranslation("data_import.results.match_badge");
          wrapper.appendChild(matchBadge);
        }
        button.appendChild(wrapper);
        button.addEventListener("click", () => {
          if (selectedRecordId === record.id) {
            return;
          }
          selectedRecordId = record.id;
          renderRecordList();
          renderRecordDetails();
        });
        recordListEl.appendChild(button);
      });
    }

    function findRecord(objectKey, recordId) {
      if (!currentGraph) return null;
      const objectData = currentGraph.objects?.[objectKey];
      if (!objectData) return null;
      return objectData.records.find((record) => record.id === recordId) || null;
    }

    function selectRelated(objectKey, recordId) {
      if (!currentGraph) return;
      if (!currentGraph.objects?.[objectKey]) {
        showToast(getTranslation("frontend.data_import.no_matches"), "info");
        return;
      }
      selectedObjectKey = objectKey;
      selectedRecordId = recordId;
      renderObjectList();
      renderRecordList();
      renderRecordDetails();
    }

    function renderRecordDetails() {
      if (!recordDetailsEl) return;
      recordDetailsEl.innerHTML = "";
      const body = document.createElement("div");
      body.className = "card-body p-0";
      recordDetailsEl.appendChild(body);
      if (!selectedObjectKey || !selectedRecordId) {
        const message = document.createElement("div");
        message.className = "text-muted small";
        message.textContent = getTranslation("data_import.results.select_record");
        body.appendChild(message);
        return;
      }
      const record = findRecord(selectedObjectKey, selectedRecordId);
      if (!record) {
        const message = document.createElement("div");
        message.className = "text-muted small";
        message.textContent = getTranslation("data_import.results.select_record");
        body.appendChild(message);
        return;
      }

      const fieldsHeading = document.createElement("h6");
      fieldsHeading.className = "fw-semibold mb-2";
      fieldsHeading.textContent = getTranslation("data_import.results.fields_heading");
      body.appendChild(fieldsHeading);

      const table = document.createElement("div");
      table.className = "data-import-fields grid";
      record.fields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "data-import-field-row d-flex flex-column flex-sm-row gap-1 py-1 border-bottom";
        const name = document.createElement("div");
        name.className = "data-import-field-name fw-semibold small text-muted";
        name.textContent = field.name;
        const value = document.createElement("div");
        value.className = "data-import-field-value flex-grow-1 small";
        value.textContent = field.value || "";
        row.appendChild(name);
        row.appendChild(value);
        table.appendChild(row);
      });
      body.appendChild(table);

      const relatedHeading = document.createElement("h6");
      relatedHeading.className = "fw-semibold mt-3 mb-2";
      relatedHeading.textContent = getTranslation("data_import.results.related_heading");
      body.appendChild(relatedHeading);

      if (!Array.isArray(record.related) || record.related.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.textContent = getTranslation("data_import.results.related_empty");
        body.appendChild(empty);
      } else {
        const chips = document.createElement("div");
        chips.className = "d-flex flex-wrap gap-2";
        record.related.forEach((item) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "btn btn-sm btn-outline-primary";
          const definition = getObjectDefinition(item.object);
          chip.textContent = `${definition?.label || item.object} · ${item.id}`;
          chip.addEventListener("click", () => selectRelated(item.object, item.id));
          chips.appendChild(chip);
        });
        body.appendChild(chips);
      }
    }

    function renderGraph(graph) {
      currentGraph = graph;
      matchKeySet = new Set();
      selectedObjectKey = null;
      selectedRecordId = null;
      resultCountBadge.textContent = "0";

      if (!graph || !graph.objects) {
        if (resultPlaceholder) {
          resultPlaceholder.classList.remove("d-none");
          resultContainer.innerHTML = "";
          resultContainer.appendChild(resultPlaceholder);
        } else {
          resultContainer.innerHTML = "";
        }
        return;
      }

      const objectKeys = Object.keys(graph.objects);
      let totalRecords = 0;
      objectKeys.forEach((key) => {
        const records = graph.objects[key].records || [];
        totalRecords += records.length;
      });
      resultCountBadge.textContent = String(totalRecords);

      if (Array.isArray(graph.matches)) {
        graph.matches.forEach((item) => {
          matchKeySet.add(`${item.object}:${item.id}`);
        });
      }

      const firstKey = objectKeys.find((key) => graph.objects[key].records.length);
      if (firstKey) {
        selectedObjectKey = firstKey;
        const firstRecord = graph.objects[firstKey].records[0];
        selectedRecordId = firstRecord?.id || null;
      }

      if (resultPlaceholder) {
        resultPlaceholder.classList.add("d-none");
        if (resultPlaceholder.parentElement === resultContainer) {
          resultContainer.removeChild(resultPlaceholder);
        }
      }
      ensureResultsLayout();
      renderObjectList();
      renderRecordList();
      renderRecordDetails();
    }

    function resetResults() {
      currentGraph = null;
      selectedObjectKey = null;
      selectedRecordId = null;
      matchKeySet = new Set();
      resultCountBadge.textContent = "0";
      objectsListEl = null;
      recordListEl = null;
      recordDetailsEl = null;
      resultContainer.innerHTML = "";
      if (resultPlaceholder) {
        resultPlaceholder.classList.remove("d-none");
        resultContainer.appendChild(resultPlaceholder);
      }
    }

    function performSearch(event) {
      event.preventDefault();
      const objectKey = objectSelect.value;
      const fieldName = fieldSelect.value;
      const searchValue = valueInput.value.trim();
      if (!objectKey || !fieldName) {
        showToast(getTranslation("frontend.data_import.missing_selection"), "warning");
        return;
      }
      if (!searchValue) {
        showToast(getTranslation("frontend.data_import.missing_value"), "warning");
        return;
      }
      const payload = {
        object: objectKey,
        field: fieldName,
        value: searchValue,
      };
      fetch("/api/data-import/related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) =>
          response
            .json()
            .catch(() => ({ error: "no_matches" }))
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            const message = data.error === "no_matches"
              ? getTranslation("frontend.data_import.no_matches")
              : lookupErrorMessage(data.error, "frontend.data_import.no_matches");
            showToast(message, "info");
            resetResults();
            return;
          }
          renderGraph(data);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : getTranslation("frontend.data_import.no_matches");
          showToast(message, "danger");
        });
    }

    function handleReset() {
      objectSelect.value = "";
      fieldSelect.innerHTML = "";
      fieldSelect.disabled = true;
      valueInput.value = "";
      clearSuggestions();
      resetResults();
    }

    cardsContainer.addEventListener("change", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.classList.contains("data-import-input")
      ) {
        handleUpload(target);
      }
    });

    cardsContainer.addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest(".data-import-remove") : null;
      if (button instanceof HTMLButtonElement) {
        handleRemove(button);
      }
    });

    objectSelect?.addEventListener("change", onObjectChange);

    valueInput?.addEventListener("input", () => {
      if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
      }
      const term = valueInput.value.trim();
      autocompleteTimeout = window.setTimeout(() => requestAutocomplete(term), 250);
    });

    searchForm?.addEventListener("submit", performSearch);
    resetButton?.addEventListener("click", handleReset);

    setStatus(statusList);
    updateAllCards();
    populateObjectSelect();
    refreshStatus();
  });
})();
