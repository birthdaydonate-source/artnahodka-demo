"use strict";
(() => {
  const detailed = document.getElementById("detailed-form");
  if (!detailed) return;
  const config = window.ARTNAHODKA_CONFIG;
  const intake = window.ARTNAHODKA_FORMS;
  const siteRoot = new URL("../../", document.currentScript.src);
  config.cdek.directoryUrl = new URL(config.cdek.directoryUrl, siteRoot).href;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const money = intake.money;
  const forms = [detailed];
  const selectedWork = { title: "Семья из разных фото — заявка со статьи", id: "family-composite" };
  let files = [], fileId = 0;
  Object.keys(config.prices).forEach(size => detailed.elements.size.add(new Option(size.replace("×", " × "), size)));
  detailed.elements.size.add(new Option("Свой размер", "custom"));
  intake.setup(detailed);
  $$('[data-extra]').forEach(el => { el.textContent = "+" + money(config.extras[el.dataset.extra]); });
  document.querySelectorAll('dialog').forEach(dialog => {
    const close = dialog.querySelector('[data-close]');
    if (!close) return;
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
  });
  function updateEstimate() {
    intake.orientation(detailed);
    const size = detailed.elements.size.value;
    $("#custom-size-field").hidden = size !== "custom";
    let total = config.prices[size];
    if (typeof total !== "number") {
      if ($("#estimate-note")) $("#estimate-note").textContent = "Стоимость размера и выбранных опций согласуем индивидуально.";
      $("#order-total").textContent =
        size === "custom" ? "Рассчитаем индивидуально" : "После выбора размера";
      return;
    }
    Object.entries(config.extras).forEach(([name, amount]) => {
      if (detailed.elements[name]?.checked) total += amount;
    });
    $("#order-total").textContent = money(total);
    let note = $("#estimate-note");
    if (!note) { note = document.createElement("small"); note.id="estimate-note"; note.className="estimate-note"; $("#order-total").parentElement.append(note); }
    const unknown = intake.quote(detailed).unknown;
    note.textContent = unknown.length ? "Отдельно согласуем: " + unknown.join(", ") + "." : "Окончательную стоимость подтвердим при согласовании.";
  }
  detailed.addEventListener("change", updateEstimate);
  updateEstimate();
  const deliverySelect = detailed.elements.delivery;
  const city = detailed.elements.city;
  const deliveryErrors = {city: "city-error", courierAddress: "courier-address-error", cdekAddress: "cdek-address-error"};
  function clearDeliveryError(field) {
    field.removeAttribute("aria-invalid");
    const error = document.getElementById(deliveryErrors[field.name]);
    if (error) { error.hidden = true; error.textContent = ""; }
  }
  function updateDelivery() {
    const courier = deliverySelect.value === "courier", cdek = deliverySelect.value === "cdek";
    city.required = courier || cdek;
    $("#city-requirement").textContent = city.required ? "*" : "необязательно";
    $("#city-requirement").className = city.required ? "required" : "optional";
    $("#courier-fields").hidden = !courier;
    $("#cdek-fields").hidden = !cdek;
    $("#pickup-address").hidden = deliverySelect.value !== "pickup";
    for (const [name, active] of [["courierAddress", courier], ["courierComment", courier], ["cdekAddress", cdek]]) {
      const field = detailed.elements[name];
      field.disabled = !active;
      field.required = active && name !== "courierComment";
      clearDeliveryError(field);
    }
    clearDeliveryError(city);
    $(".form-status", detailed).textContent = "";
  }
  function validateDelivery() {
    let firstInvalid = null;
    const messages = {city: "Укажите город доставки.", courierAddress: "Укажите улицу, дом и квартиру или офис.", cdekAddress: "Выберите пункт выдачи СДЭК на карте или в списке."};
    for (const name of Object.keys(messages)) {
      const field = detailed.elements[name]; clearDeliveryError(field);
      if (field.required && !field.disabled && (!field.value.trim() || (name === "cdekAddress" && !detailed.elements.cdekPvzCode.value))) {
        field.setAttribute("aria-invalid", "true");
        const error = document.getElementById(deliveryErrors[name]);
        error.textContent = messages[name]; error.hidden = false;
        firstInvalid ||= field;
      }
    }
    if (firstInvalid) {
      $(".order-details").open = true;
      (firstInvalid.name === "cdekAddress" ? $("#choose-cdek") : firstInvalid).focus();
      return false;
    }
    return true;
  }
  deliverySelect.addEventListener("change", updateDelivery);
  for (const name of Object.keys(deliveryErrors)) detailed.elements[name].addEventListener("input", () => clearDeliveryError(detailed.elements[name]));
  updateDelivery();
  // Use the main site’s PHP endpoint and shared validation/pricing contract.
  let sendingOrder = false;
  const orderRequestIds = new WeakMap();
  const sentForms = new WeakSet();
  forms.forEach((form) => {
    form.addEventListener("input", (e) => {
      const field = e.target;
      if (["phone", "email", "telegram", "name", "comment"].includes(field.name))
        forms
          .filter((f) => f !== form && !sentForms.has(f))
          .forEach((f) => {
            if (f.elements[field.name])
              f.elements[field.name].value = field.value;
          });
      field.removeAttribute("aria-invalid");
      if (!sentForms.has(form)) { $(".form-status", form).textContent = ""; $(".form-status", form).dataset.state = "error"; }
    });
    form.addEventListener("submit", async (e) => {
      if (sendingOrder || sentForms.has(form)) { e.preventDefault(); return; }
      e.preventDefault();
      const status = $(".form-status", form);
      status.dataset.state = "error";
      if (form === detailed && !validateDelivery()) {
        status.textContent = "Заполните обязательные поля доставки.";
        return;
      }
      if (!files.length) {
        status.textContent =
          "Добавьте хотя бы одну фотографию или отправьте её нам в мессенджере.";
        $(".upload__button", form).focus();
        return;
      }
      if (!intake.validate(form)) return;
      if (!form.elements.consent.checked) {
        status.textContent = "Отметьте согласие с условиями обработки данных.";
        form.elements.consent.focus();
        return;
      }
      const endpoint = new URL(config.orderEndpoint, siteRoot);
      if (endpoint.hostname.endsWith(".github.io")) {
        status.textContent = "Это демо: отправка будет доступна после подключения PHP-обработчика на хостинге. Заявка и фотографии не отправлены.";
        return;
      }
      let orderRequestId = orderRequestIds.get(form);
      if (!orderRequestId) {
        orderRequestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
        orderRequestIds.set(form, orderRequestId);
      }
      const payload = new FormData(form);
      payload.append("requestId", orderRequestId);
      payload.set("formType", form === detailed ? "detailed" : "quick");
      intake.payload(form, payload, form === detailed);
      payload.append("selectedWork", selectedWork ? `${selectedWork.title} (${selectedWork.id || ""})` : "");
      files.forEach(({file}) => payload.append("photos[]", file, file.name));
      const button = form.querySelector('[type="submit"]');
      const originalLabel = button.textContent;
      const controls = forms.flatMap(f => [...f.querySelectorAll("input,select,textarea,button")]).map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      sendingOrder = true; button.disabled = true;
      form.setAttribute("aria-busy", "true");
      button.textContent = "Отправляем…";
      status.dataset.state = "pending";
      status.textContent = "Загружаем фотографии и отправляем заявку. Дождитесь подтверждения.";
      try {
        const response = await fetch(endpoint.href, {method: "POST", body: payload, credentials: "omit"});
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.ok !== true || result.orderId !== orderRequestId) {
          if (intake.priceChanged(result)) { updateEstimate(); $$("[data-extra]").forEach(el => {el.textContent="+"+money(config.extras[el.dataset.extra]);}); }
          if (response.status === 422 || response.status === 413 || result?.code === "price_changed") orderRequestIds.delete(form);
          throw new Error(result?.error || (response.status === 413 ? "Файлы превышают лимит хостинга. Уменьшите размер фотографий." : "Сервер не подтвердил отправку. Данные остались в форме."));
        }
        intake.success(form, result);
        sentForms.add(form);
        button.textContent = "Заявка отправлена";
        // Keep this request ID so an accidental retry cannot send a duplicate.
        button.disabled = true;
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = error instanceof TypeError ? "Не удалось подтвердить отправку. Проверьте соединение и повторите попытку: повторная заявка не создаст дубликат." : error.message;
        button.textContent = originalLabel; button.disabled = false;
      } finally {
        controls.forEach(([el, disabled]) => { el.disabled = disabled; });
        if (sentForms.has(form)) form.querySelectorAll("input,select,textarea,button").forEach(el => {el.disabled = true;});
        sendingOrder = false; form.removeAttribute("aria-busy");
      }
    });
  });
  const allowedExtensions = /\.(jpe?g|png|webp|heic|heif)$/i;
  const previewExtensions = /\.(jpe?g|png|webp)$/i;
  const MAX_FILE = 30 * 1024 * 1024,
    MAX_TOTAL = 150 * 1024 * 1024,
    MAX_FILES = 10;
  $$("[data-upload]").forEach((host) => {
    const prefix = host.dataset.upload;
    host.innerHTML = `<div class="upload__zone"><input type="file" id="${prefix}-photos" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden><button type="button" class="upload__button"><span aria-hidden="true">＋</span> Добавить фотографии</button><p>До 10 файлов: JPG, PNG, WebP, HEIC.<br>До 30 МБ каждый, до 150 МБ вместе.</p></div><div class="upload__list" aria-label="Добавленные фотографии"></div><p class="upload__error" role="status" aria-live="polite"></p>`;
    const input = $("input", host);
    const zone = $(".upload__zone", host);
    $(".upload__button", host).addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      addFiles(input.files, host);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((name) =>
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        zone.classList.add("dragging");
      }),
    );
    ["dragleave", "drop"].forEach((name) =>
      zone.addEventListener(name, (e) => {
        e.preventDefault();
        zone.classList.remove("dragging");
      }),
    );
    zone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files, host));
  });
  function addFiles(incoming, host) {
    if (sendingOrder || sentForms.has(detailed)) return;
    const errors = [];
    for (const file of incoming) {
      if (!allowedExtensions.test(file.name)) {
        errors.push(`${file.name}: неподдерживаемый формат.`);
        continue;
      }
      if (file.size === 0 || file.size > MAX_FILE) {
        errors.push(`${file.name}: файл пустой или больше 30 МБ.`);
        continue;
      }
      if (
        files.some(
          (x) =>
            x.file.name === file.name &&
            x.file.size === file.size &&
            x.file.lastModified === file.lastModified,
        )
      )
        continue;
      if (files.length >= MAX_FILES) {
        errors.push("Можно добавить не более 10 фотографий.");
        break;
      }
      if (files.reduce((n, x) => n + x.file.size, 0) + file.size > MAX_TOTAL) {
        errors.push("Общий объём фотографий не должен превышать 150 МБ.");
        break;
      }
      files.push({
        id: ++fileId,
        file,
        url: previewExtensions.test(file.name)
          ? URL.createObjectURL(file)
          : null,
      });
    }
    renderFiles();
    $(".upload__error", host).textContent = errors.join(" ");
    forms.forEach((f) => {
      $(".form-status", f).textContent = "";
    });
  }
  function renderFiles() {
    $$("[data-upload]").forEach((host) => {
      $(".upload__error", host).textContent = "";
      $(".upload__list", host).innerHTML = files
        .map(
          (x) =>
            `<div class="upload__file">${x.url ? `<img src="${x.url}" alt="Превью ${escapeHTML(x.file.name)}">` : '<div class="upload__file-placeholder">HEIC / HEIF</div>'}<span title="${escapeHTML(x.file.name)}">${escapeHTML(x.file.name)}</span><button class="upload__remove" type="button" data-file-id="${x.id}" aria-label="Удалить ${escapeHTML(x.file.name)}">×</button></div>`,
        )
        .join("");
      $$(".upload__file img", host).forEach((im) =>
        im.addEventListener(
          "error",
          () => {
            const placeholder = document.createElement("div");
            placeholder.className = "upload__file-placeholder";
            placeholder.textContent = "Без превью";
            im.replaceWith(placeholder);
          },
          { once: true },
        ),
      );
      $$("[data-file-id]", host).forEach((b) =>
        b.addEventListener("click", () => {
          if (sendingOrder || sentForms.has(detailed)) return;
          const found = files.find((x) => x.id === Number(b.dataset.fileId));
          if (found?.url) URL.revokeObjectURL(found.url);
          files = files.filter((x) => x !== found);
          renderFiles();
          $(".upload__button", host).focus();
          forms.forEach((f) => {
            $(".form-status", f).textContent = "";
          });
        }),
      );
    });
  }

})();
