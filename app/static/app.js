const state = {
  selectedOrg: null,
};

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

function bindOrgSelection() {
  document.querySelectorAll(".org-select").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOrg = button.dataset.org;
      const label = button.querySelector("strong")?.textContent.trim() ?? button.textContent.trim();
      document.getElementById("selected-org").value = label;
      document.querySelectorAll(".org-select").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function renderQueryResult(data) {
  const container = document.getElementById("query-result");
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
    } catch (error) {
      showToast(error.message, "danger");
    }
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
      showToast(error.message, "danger");
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
  bindOrgForm();
});
