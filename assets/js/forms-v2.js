"use strict";
(() => {
  const methods = {phone: "Телефон", email: "Email", telegram: "Telegram", max: "MAX"};
  const phoneOK = value => /^[+\d\s()−–-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, ""));
  const emailOK = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const telegramOK = value => /^@[a-z\d_]{5,32}$/i.test(value);
  const money = value => new Intl.NumberFormat("ru-RU").format(value) + " ₽";
  let pricingVersion = "2026-09-23-1";
  const value = (form, name) => form.elements[name]?.value.trim() || "";
  function sync(form) {
    const method = value(form, "contactMethod") || "phone";
    const detailed = form.id === "detailed-form";
    const delivery = detailed && value(form, "delivery") !== "later";
    for (const name of ["phone", "email", "telegram"]) {
      const input = form.elements[name];
      if (!input) continue;
      const active = name === "telegram" ? method === "telegram" : detailed || (name === "phone" ? ["phone", "max"].includes(method) : method === "email");
      input.closest("[data-contact-field]").hidden = !active;
      input.disabled = !active;
      input.required = active && (name === "phone" ? delivery || ["phone", "max"].includes(method) : method === name);
      const requirement = input.closest("label").querySelector("[data-required]");
      if (requirement) requirement.textContent = input.required ? "*" : "необязательно";
    }
    const hint = form.querySelector("[data-phone-hint]");
    if (hint) hint.textContent = method === "max" ? "Номер, который вы используете в MAX." : delivery ? "Этот номер используем для доставки. Повторно вводить его не нужно." : "С кодом страны, например +7 999 123-45-67.";
    if (detailed) {
      const toggle = form.elements.differentRecipient;
      toggle.closest("label").hidden = !delivery;
      toggle.disabled = !delivery;
      for (const name of ["recipientName", "recipientPhone"]) {
        const input = form.elements[name];
        input.disabled = !delivery || !toggle.checked;
        input.required = !input.disabled;
      }
      form.querySelector("[data-recipient-fields]").hidden = !delivery || !toggle.checked;
    }
  }
  function geometry(form) {
    if (!form.elements.size) return null;
    const raw = value(form, "size") === "custom" ? value(form, "customSize") : value(form, "size");
    const m = raw.match(/^(\d{1,4}(?:[.,]\d{1,2})?)\s*[×xхXХ*]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:см)?$/);
    return m ? m.slice(1).map(n => Number(n.replace(",", "."))) : null;
  }
  function orientation(form) {
    if (!form.elements.orientation) return;
    const dimensions = geometry(form), square = dimensions ? dimensions[0] === dimensions[1] : null;
    const select = form.elements.orientation;
    for (const option of select.options) {
      const bad = square === true ? option.value !== "Квадратная" : square === false ? option.value === "Квадратная" : false;
      option.hidden = bad; option.disabled = bad;
    }
    if (square === true) select.value = "Квадратная";
    else if (square === false && select.value === "Квадратная") select.value = "unknown";
    form.elements.customSize.required = value(form, "size") === "custom";
    form.elements.customSize.disabled = value(form, "size") !== "custom";
  }
  function fail(form, input, message) {
    const status = form.querySelector(".form-status");
    status.dataset.state = "error"; status.textContent = message;
    if (input) {
      input.setAttribute("aria-invalid", "true");
      const details = input.closest("details"); if (details) details.open = true;
      input.focus();
    }
    return false;
  }
  function validate(form) {
    sync(form); orientation(form);
    for (const name of ["phone", "email", "telegram", "recipientName", "recipientPhone"]) {
      const input = form.elements[name];
      if (!input || input.disabled) continue;
      const v = input.value.trim();
      if (input.required && !v) return fail(form, input, {phone: "Укажите телефон для связи и доставки.", email: "Укажите email для ответа.", telegram: "Укажите Telegram в формате @username.", recipientName: "Укажите имя получателя.", recipientPhone: "Укажите телефон получателя."}[name]);
      if (v && (["phone", "recipientPhone"].includes(name) && !phoneOK(v) || name === "email" && !emailOK(v) || name === "telegram" && !telegramOK(v))) return fail(form, input, name === "email" ? "Проверьте адрес электронной почты." : name === "telegram" ? "Telegram укажите в формате @username." : "Укажите телефон с кодом страны: от 10 до 15 цифр.");
    }
    if (form.elements.size && value(form, "size") === "custom") {
      const dimensions = geometry(form);
      if (!dimensions || dimensions.some(n => n <= 0 || n > 1000)) return fail(form, form.elements.customSize, "Укажите свой размер в сантиметрах, например 70 × 100.");
    }
    return true;
  }
  function quote(form) {
    const config = window.ARTNAHODKA_CONFIG;
    const base = config.prices[value(form, "size")];
    const extras = Object.entries(config.extras).filter(([name]) => form.elements[name]?.checked).map(([key, amount]) => ({key, label: key === "lacquer" ? "Лак" : "Подарочная упаковка", amount}));
    const unknown = [];
    if (typeof base !== "number") unknown.push("Размер и базовая стоимость");
    if (form.elements.frame?.checked) unknown.push("Багет");
    if (value(form, "delivery") !== "pickup") unknown.push("Доставка");
    return {version: pricingVersion, currency: "RUB", base: base ?? null, extras, subtotal: typeof base === "number" ? base + extras.reduce((n, x) => n + x.amount, 0) : null, unknown};
  }
  function payload(form, data, detailed = false) {
    const method = value(form, "contactMethod");
    data.set("formVersion", "2");
    data.set("contactMethod", method);
    for (const name of ["phone", "email", "telegram", "recipientName", "recipientPhone"]) data.set(name, form.elements[name] && !form.elements[name].disabled ? value(form, name) : "");
    data.set("contact", data.get(method === "max" ? "phone" : method) || "");
    if (detailed) {
      const estimate = quote(form);
      data.set("pricingVersion", pricingVersion);
      data.set("estimatedTotal", estimate.subtotal === null ? "" : String(estimate.subtotal));
    }
  }
  function priceChanged(result) {
    const catalog = result?.catalog;
    if (result?.code !== "price_changed" || !catalog?.prices || !catalog?.extras) return false;
    const config = window.ARTNAHODKA_CONFIG;
    for (const [target, source] of [[config.prices, catalog.prices], [config.extras, catalog.extras]]) {
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, source);
    }
    pricingVersion = catalog.version;
    return true;
  }
  function success(form, result) {
    const status = form.querySelector(".form-status");
    status.replaceChildren(); status.dataset.state = "success"; status.tabIndex = -1;
    const title = document.createElement("strong"); title.className = "success-title"; title.textContent = "Спасибо! Ваша заявка отправлена!";
    const number = document.createElement("span"); number.className = "success-number"; number.textContent = "Номер заявки: " + result.orderId;
    status.append(title, number);
    const dl = document.createElement("dl"); dl.className = "success-summary";
    for (const [label, content] of Object.entries(result.summary || {})) {
      if (content === "" || content === null) continue;
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = String(content); dl.append(dt, dd);
    }
    status.append(dl);
    const next = document.createElement("span"); next.className = "success-next"; next.textContent = "Мы свяжемся с вами, чтобы согласовать макет, детали и окончательную стоимость."; status.append(next);
    status.scrollIntoView({behavior: "smooth", block: "center"}); status.focus({preventScroll: true});
  }
  function setup(form) {
    sync(form); orientation(form);
    form.addEventListener("change", () => { if (form.getAttribute("aria-busy") !== "true") { sync(form); orientation(form); } });
    form.elements.customSize?.addEventListener("input", () => orientation(form));
  }
  function focus(form) { const m = value(form, "contactMethod"); form.elements[m === "max" ? "phone" : m]?.focus({preventScroll: true}); }
  window.ARTNAHODKA_FORMS = {setup, sync, orientation, validate, payload, quote, success, priceChanged, focus, money, methods};
})();
