(function () {
  function translateKey(key, params = {}) {
    if (typeof translate === "function") {
      return translate(key, params);
    }
    return key;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("account-explorer-settings");
    if (!container) {
      return;
    }

    const orgSelect = document.getElementById("account-explorer-settings-org");
    const saveButton = document.getElementById("account-explorer-settings-save");
    const resetButton = document.getElementById("account-explorer-settings-reset");
    const statusEl = document.getElementById("account-explorer-settings-status");

    const sections = Array.from(
      container.querySelectorAll(".account-explorer-settings-object")
    );
    const inputsByObject = new Map();
    const datalistsByObject = new Map();
    sections.forEach((section) => {
      const objectKey = section.dataset.object;
      if (!objectKey) {
        return;
      }
      const inputs = Array.from(
        section.querySelectorAll(".account-explorer-field-input")
      );
      inputsByObject.set(objectKey, inputs);
      const datalist = section.querySelector("datalist");
      if (datalist) {
        datalistsByObject.set(objectKey, datalist);
      }
    });

    const fieldCache = new Map();

    function setStatus(message, type = "muted") {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message || "";
      statusEl.className = "small";
      if (message) {
        statusEl.classList.add(`text-${type}`);
      } else {
        statusEl.classList.add("text-muted");
      }
    }

    function populateOrgOptions() {
      if (!orgSelect) {
        return;
      }
      fetch("/api/orgs")
        .then((response) => response.json())
        .then((data) => {
          if (!Array.isArray(data)) {
            return;
          }
          const current = orgSelect.value;
          orgSelect.innerHTML = "";
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = translateKey(
            "settings.account_explorer.org_placeholder"
          );
          orgSelect.appendChild(placeholder);
          data.forEach((org) => {
            const option = document.createElement("option");
            option.value = org.id;
            option.textContent = org.label || org.id;
            orgSelect.appendChild(option);
          });
          if (current && orgSelect.querySelector(`option[value="${current}"]`)) {
            orgSelect.value = current;
          }
        })
        .catch(() => {
          showToast(
            translateKey("frontend.account_explorer.orgs_failed"),
            "danger"
          );
        });
    }

    function populateFields(resolved) {
      inputsByObject.forEach((inputs, objectKey) => {
        const values = Array.isArray(resolved?.[objectKey])
          ? resolved[objectKey]
          : [];
        inputs.forEach((input, index) => {
          input.value = values[index] || "";
        });
      });
    }

    function fetchConfig() {
      setStatus(translateKey("settings.account_explorer.loading"), "muted");
      fetch("/api/account-explorer/config")
        .then((response) =>
          response
            .json()
            .then((data) => ({ ok: response.ok, data }))
        )
        .then(({ ok, data }) => {
          if (!ok) {
            throw new Error("config_failed");
          }
          populateFields(data?.resolved || {});
          setStatus("", "muted");
        })
        .catch(() => {
          setStatus(translateKey("settings.account_explorer.load_failed"), "danger");
        });
    }

    function gatherFields() {
      const payload = {};
      inputsByObject.forEach((inputs, objectKey) => {
        const values = inputs
          .map((input) => (input.value || "").trim())
          .filter((value) => value);
        if (values.length) {
          payload[objectKey] = values;
        }
      });
      return payload;
    }

    function ensureObjectFieldsLoaded(objectKey) {
      if (!orgSelect || !orgSelect.value) {
        showToast(
          translateKey("frontend.account_explorer.no_org"),
          "warning"
        );
        return;
      }
      const cacheKey = `${orgSelect.value}:${objectKey}`;
      if (fieldCache.has(cacheKey)) {
        fillDatalist(objectKey, fieldCache.get(cacheKey));
        return;
      }
      fetch(
        `/api/account-explorer/fields?org_id=${encodeURIComponent(
          orgSelect.value
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
          fillDatalist(objectKey, fields);
        })
        .catch(() => {
          showToast(
            translateKey("frontend.account_explorer.fields_failed"),
            "danger"
          );
        });
    }

    function fillDatalist(objectKey, fields) {
      const datalist = datalistsByObject.get(objectKey);
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

    function saveConfig() {
      const fields = gatherFields();
      fetch("/api/account-explorer/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
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
          populateFields(data?.resolved || {});
          setStatus(translateKey("settings.account_explorer.saved"), "success");
          showToast(
            translateKey("settings.account_explorer.toast_saved"),
            "success"
          );
        })
        .catch(() => {
          setStatus(translateKey("settings.account_explorer.save_failed"), "danger");
        });
    }

    if (saveButton) {
      saveButton.addEventListener("click", saveConfig);
    }
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        fieldCache.clear();
        fetchConfig();
      });
    }
    if (orgSelect) {
      orgSelect.addEventListener("change", () => {
        fieldCache.clear();
      });
    }

    inputsByObject.forEach((inputs, objectKey) => {
      inputs.forEach((input) => {
        input.addEventListener("focus", () => ensureObjectFieldsLoaded(objectKey));
      });
    });

    populateOrgOptions();
    fetchConfig();
  });
})();
