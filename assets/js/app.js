"use strict";
(() => {
  const config = window.ARTNAHODKA_CONFIG;
  const works = window.ARTNAHODKA_WORKS || [];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (n) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  const forms = [$("#quick-form"), $("#detailed-form")];
  const quick = $("#quick-dialog");
  const viewer = $("#viewer-dialog");
  let selectedWork = null;
  let files = [];
  let fileId = 0;
  const mobile = window.matchMedia("(max-width: 760px)");

  // The URLs and icons are the studio's existing published contacts.
  $$("[data-messengers]").forEach((el) => {
    const labelled = el.dataset.messengers === "labelled";
    el.classList.toggle("labelled", labelled);
    el.innerHTML = [
      { name: "Telegram", icon: "telegram", url: config.contacts.telegram },
      { name: "MAX", icon: "max", url: config.contacts.max },
    ]
      .map(
        (m) =>
          `<a href="${escapeHTML(m.url)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в ${m.name}"><img src="assets/images/brand/${m.icon}.png" alt="" width="32" height="32">${labelled ? `<span>${m.name}</span>` : ""}</a>`,
      )
      .join("");
  });
  $("#year").textContent = new Date().getFullYear();
  $$("[data-min-price]").forEach((el) => {
    el.textContent = money(Math.min(...Object.values(config.prices)));
  });

  const menuButton = $(".menu-button");
  const menu = $("#mobile-nav");
  function closeMenu() {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }
  menuButton.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a,button")) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  function openDialog(dialog) {
    closeMenu();
    dialog.showModal();
    document.body.classList.add("dialog-open");
  }
  $$("dialog").forEach((dialog) => {
    $("[data-close]", dialog).addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      if (!$("dialog[open]")) document.body.classList.remove("dialog-open");
    });
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    });
  });
  $$(".js-quick").forEach((b) =>
    b.addEventListener("click", () => openDialog(quick)),
  );
  $("#switch-detailed").addEventListener("click", () => {
    quick.close();
    $("#order").scrollIntoView({ block: "start" });
    forms[1].elements.contact.focus({ preventScroll: true });
  });

  // Progressive gallery: 9 desktop / 10 mobile, also after filtering.
  const topics = [
    ["all", "Все работы"],
    ["pets", "Питомцы"],
    ["family", "Семья и пары"],
    ["family-composite", "Семья из разных фото"],
    ["styles", "Стилизации"],
    ["painterly", "Живописный"],
    ["dreamart", "Дрим-арт"],
    ["children", "Дети"],
    ["collages", "Коллажи"],
    ["restoration", "Реставрация"],
  ];
  let activeTopic = "all";
  let pageSize = mobile.matches ? 10 : 9;
  let visibleCount = pageSize;
  const filters = $("#gallery-filters");
  filters.innerHTML = topics
    .map(
      ([id, label]) =>
        `<button type="button" data-topic="${id}" aria-pressed="${id === "all"}">${label}</button>`,
    )
    .join("");
  const filteredWorks = () =>
    works.filter((w) => activeTopic === "all" || w.tags.includes(activeTopic));
  const lastBatchSize = (shown) =>
    shown > pageSize ? ((shown - 1) % pageSize) + 1 : 0;
  function card(w) {
    const first = w.images[0];
    const sourceIndex = w.images.findIndex((im) =>
      im.label.startsWith("Исходн"),
    );
    const roomIndex = w.images.findLastIndex((im) =>
      /интерьере/.test(im.label),
    );
    const strip = [
      ...new Set([
        sourceIndex >= 0 ? sourceIndex : 0,
        0,
        roomIndex >= 0 ? roomIndex : w.images.length - 1,
      ]),
    ].map((index) => ({ ...w.images[index], index }));
    return `<article class="work" data-work="${escapeHTML(w.id)}"><button class="work__main" type="button" data-open="0" aria-label="Открыть работу: ${escapeHTML(w.title)}"><img src="${escapeHTML(first.thumb)}" alt="${escapeHTML(w.title)}" width="${first.width}" height="${first.height}" loading="lazy" decoding="async"><span class="work__zoom" aria-hidden="true">↗</span></button><h3>${escapeHTML(w.title)}</h3><div class="work__strip">${strip.map((im, i) => `<button type="button" data-open="${im.index}" aria-label="${escapeHTML(im.label)} — ${escapeHTML(w.title)}"><img src="${escapeHTML(im.thumb)}" alt="" width="${im.width}" height="${im.height}" loading="lazy" decoding="async">${i === strip.length - 1 && w.images.length > strip.length ? `<span>+${w.images.length - strip.length}</span>` : ""}</button>`).join("")}</div><p class="work__label">${w.images.length} изображения${w.generated ? " · пример стилизации" : ""} · нажмите, чтобы рассмотреть</p></article>`;
  }
  function renderGallery(append = false) {
    const list = filteredWorks();
    const already = append ? $("#gallery").children.length : 0;
    const html = list.slice(already, visibleCount).map(card).join("");
    if (append) $("#gallery").insertAdjacentHTML("beforeend", html);
    else $("#gallery").innerHTML = html;
    $("#gallery-count").textContent =
      `${topics.find((t) => t[0] === activeTopic)[1]} · ${list.length} ${plural(list.length, ["работа", "работы", "работ"])}`;
    const shown = Math.min(visibleCount, list.length);
    $("#gallery-progress").textContent =
      `Показано ${shown} из ${list.length}`;
    const remaining = list.length - shown;
    const hideCount = lastBatchSize(shown);
    $("#load-more").hidden = remaining === 0;
    $("#collapse-gallery").hidden = hideCount === 0;
    $("#collapse-gallery").textContent = `Скрыть ${hideCount}`;
    $("#load-more").textContent =
      remaining >= pageSize
        ? `Показать ещё ${pageSize}`
        : `Показать оставшиеся (${remaining})`;
  }
  function plural(n, words) {
    return words[
      n % 10 === 1 && n % 100 !== 11
        ? 0
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? 1
          : 2
    ];
  }
  filters.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-topic]");
    if (!b) return;
    activeTopic = b.dataset.topic;
    visibleCount = pageSize;
    $$("button", filters).forEach((t) =>
      t.setAttribute("aria-pressed", String(t === b)),
    );
    renderGallery();
  });
  $("#load-more").addEventListener("click", () => {
    const before = $("#gallery").children.length;
    visibleCount = Math.min(visibleCount + pageSize, filteredWorks().length);
    renderGallery(true);
    const firstNew = $("#gallery").children[before]?.querySelector("button");
    firstNew?.focus({ preventScroll: true });
  });
  $("#collapse-gallery").addEventListener("click", () => {
    const shown = Math.min(visibleCount, filteredWorks().length);
    const hideCount = lastBatchSize(shown);
    if (!hideCount) return;
    visibleCount = shown - hideCount;
    renderGallery();
    // Keep the controls in view and focus on a button that remains available.
    const control = $("#collapse-gallery").hidden
      ? $("#load-more")
      : $("#collapse-gallery");
    control.focus({ preventScroll: true });
    control.scrollIntoView({ block: "nearest", behavior: "instant" });
  });
  mobile.addEventListener("change", () => {
    const collapsed = visibleCount <= pageSize;
    pageSize = mobile.matches ? 10 : 9;
    visibleCount = collapsed
      ? pageSize
      : Math.ceil(visibleCount / pageSize) * pageSize;
    renderGallery();
  });
  renderGallery();

  const story = {
    id: "generated-story",
    title: "Живописный портрет для двоих",
    generated: true,
    images: [
      {
        src: "assets/images/generated/source.webp",
        thumb: "assets/images/generated/source.webp",
        label: "Исходное фото пары · сгенерированный пример",
      },
      {
        src: "assets/images/generated/artwork.webp",
        thumb: "assets/images/generated/artwork.webp",
        label: "Живописная стилизация того же фото",
      },
      {
        src: "assets/images/generated/interior.webp",
        thumb: "assets/images/generated/interior-small.webp",
        label: "Тот же портрет в интерьере",
      },
    ],
  };
  let viewed = null;
  let imageIndex = 0;
  function showImage(index) {
    if (!viewed) return;
    imageIndex = (index + viewed.images.length) % viewed.images.length;
    const im = viewed.images[imageIndex];
    const img = $("#viewer-image");
    img.src = im.src;
    img.alt = `${viewed.title}: ${im.label}`;
    $("#viewer-title").textContent = viewed.title;
    $("#viewer-label").textContent = im.label;
    $("#viewer-position").textContent =
      `Изображение ${imageIndex + 1} / ${viewed.images.length}`;
    $("#viewer-credit").textContent =
      "Иллюстративный пример создан с помощью ИИ. Это не фотография клиента. Фотографии клиентов публикуются только с письменного согласия заказчика.";
    $("#viewer-thumbs").innerHTML = viewed.images
      .map(
        (x, i) =>
          `<button type="button" data-index="${i}" aria-pressed="${i === imageIndex}" aria-label="${escapeHTML(x.label)}"><img src="${escapeHTML(x.thumb)}" alt="" loading="lazy"></button>`,
      )
      .join("");
    $("#viewer-prev").hidden = $("#viewer-next").hidden =
      viewed.images.length < 2;
  }
  function openWork(work, index = 0) {
    viewed = work;
    showImage(index);
    openDialog(viewer);
  }
  $("#gallery").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (!b) return;
    const w = works.find((w) => w.id === b.closest("[data-work]").dataset.work);
    if (w) openWork(w, Number(b.dataset.open));
  });
  $$("[data-story]").forEach((b) =>
    b.addEventListener("click", () => openWork(story, Number(b.dataset.story))),
  );
  $("#viewer-prev").addEventListener("click", () => showImage(imageIndex - 1));
  $("#viewer-next").addEventListener("click", () => showImage(imageIndex + 1));
  $("#viewer-thumbs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-index]");
    if (b) showImage(Number(b.dataset.index));
  });
  viewer.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      showImage(imageIndex - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showImage(imageIndex + 1);
    }
  });
  let touchStart = null;
  $(".viewer__stage").addEventListener(
    "touchstart",
    (e) => {
      touchStart =
        e.touches.length === 1
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : null;
    },
    { passive: true },
  );
  $(".viewer__stage").addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
        showImage(imageIndex + (dx < 0 ? 1 : -1));
      touchStart = null;
    },
    { passive: true },
  );
  $("#viewer-choose").addEventListener("click", () => {
    selectedWork = viewed;
    renderSelection();
    viewer.close();
    openDialog(quick);
  });
  function renderSelection() {
    $$("[data-selection]").forEach((el) => {
      el.hidden = !selectedWork;
      el.innerHTML = selectedWork
        ? `<img src="${escapeHTML(selectedWork.images[0].thumb)}" alt=""><span><small>Выбранный пример</small>${escapeHTML(selectedWork.title)}</span><button type="button" aria-label="Убрать выбранный пример">×</button>`
        : "";
      $("button", el)?.addEventListener("click", () => {
        selectedWork = null;
        renderSelection();
      });
    });
  }

  // Prices use one source, including optional extras. Custom sizes are not quoted automatically.
  const priceSelect = $("#price-size");
  const detailed = forms[1];
  Object.keys(config.prices).forEach((size) => {
    priceSelect.add(new Option(size.replace("×", " × "), size));
    detailed.elements.size.add(new Option(size.replace("×", " × "), size));
  });
  detailed.elements.size.add(new Option("Свой размер", "custom"));
  priceSelect.value = "40×50";
  const advice = {
    "30×40": "Компактный портрет для небольшой стены или уютного уголка.",
    "40×50": "Универсальный формат для одного или двух человек.",
    "50×65": "Выразительный акцент над комодом или рабочим столом.",
    "60×80":
      "Крупный портрет для просторной стены. Для группы людей проверим детализацию фото.",
  };
  function updateSize() {
    const size = priceSelect.value;
    $("#size-price").textContent = money(config.prices[size]);
    $$(".size-tabs button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.size === size)),
    );
    $("#size-photo").src = `assets/images/sizes/size-${size.replace("×", "x")}.webp`;
    $("#size-photo").alt = `Визуализация холста ${size.replace("×", " на ")} сантиметров рядом с человеком`;
    $(".size-figure figcaption").textContent = `${size.replace("×", " × ")} см · визуализация примерного масштаба`;
    $("#size-advice").textContent =
      advice[size] ||
      "Подберём композицию под выбранный формат и проверим, хватит ли качества фотографии для печати.";
  }
  priceSelect.addEventListener("change", updateSize);
  $$(".size-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      priceSelect.value = b.dataset.size;
      updateSize();
    }),
  );
  $("#choose-size").addEventListener("click", () => {
    detailed.elements.size.value = priceSelect.value;
    $(".order-details").open = true;
    updateEstimate();
    $("#order").scrollIntoView({ block: "start" });
    detailed.elements.contact.focus({ preventScroll: true });
  });
  $$("[data-extra]").forEach((el) => {
    el.textContent = "+" + money(config.extras[el.dataset.extra]);
  });
  function updateEstimate() {
    const size = detailed.elements.size.value;
    $("#custom-size-field").hidden = size !== "custom";
    let total = config.prices[size];
    if (typeof total !== "number") {
      $("#order-total").textContent =
        size === "custom" ? "Рассчитаем индивидуально" : "После выбора размера";
      return;
    }
    Object.entries(config.extras).forEach(([name, amount]) => {
      if (detailed.elements[name]?.checked) total += amount;
    });
    $("#order-total").textContent = money(total);
  }
  detailed.addEventListener("change", updateEstimate);
  updateSize();
  updateEstimate();
  const frameDescriptions = {
    plain: "Портрет на холсте без внешней рамы",
    oak: "Тот же портрет в лаконичном багете",
  };
  const classicFrames = [
    ["gold", "Золотая классика"], ["silver", "Серебряный орнамент"],
    ["ivory", "Слоновая кость"], ["walnut", "Тёмный орех"],
    ["bronze", "Состаренная бронза"], ["black-gold", "Чёрный с золотом"],
    ["champagne", "Шампань"], ["baroque", "Золотое барокко"],
  ];
  let frameType = "plain", classicIndex = 0;
  const frameImage = $("#frame-image");
  const frameGallery = $("#frame-gallery");
  $("#classic-thumbnails").innerHTML = classicFrames.map(([id, label], index) =>
    `<button type="button" data-classic="${index}" aria-label="${label}" aria-pressed="false"><img src="assets/images/frames/classic-${id}-thumb.webp" alt="" width="80" height="80" loading="lazy"></button>`
  ).join("");
  function renderFrame() {
    const classic = frameType === "classic";
    $("#classic-controls").hidden = !classic;
    frameGallery.tabIndex = classic ? 0 : -1;
    frameImage.src = classic ? `assets/images/frames/classic-${classicFrames[classicIndex][0]}.webp?v=2` : `assets/images/generated/frame-${frameType}.webp`;
    frameImage.alt = classic ? `Портрет в багете «${classicFrames[classicIndex][1]}»` : frameDescriptions[frameType];
    $("#frame-caption").textContent = `${classicIndex + 1} / ${classicFrames.length} · ${classicFrames[classicIndex][1]}`;
    $$("[data-classic]").forEach((button, index) => button.setAttribute("aria-pressed", String(index === classicIndex)));
    detailed.elements.frameExample.value = classic ? classicFrames[classicIndex][1] : frameType === "oak" ? "Лаконичный багет" : "";
  }
  function stepFrame(delta) {
    if (frameType !== "classic") return;
    classicIndex = (classicIndex + delta + classicFrames.length) % classicFrames.length;
    renderFrame();
  }
  $$(".frame-options button").forEach((button) => button.addEventListener("click", () => {
    frameType = button.dataset.frame;
    $$(".frame-options button").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    renderFrame();
  }));
  $("#frame-prev").addEventListener("click", () => stepFrame(-1));
  $("#frame-next").addEventListener("click", () => stepFrame(1));
  $$("[data-classic]").forEach(button => button.addEventListener("click", () => {
    classicIndex = Number(button.dataset.classic); renderFrame();
  }));
  frameGallery.addEventListener("keydown", event => {
    if (frameType === "classic" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); stepFrame(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  let swipeStart = null;
  frameImage.draggable = false;
  frameImage.addEventListener("pointerdown", event => {
    if (frameType !== "classic" || !event.isPrimary) return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    frameImage.setPointerCapture(event.pointerId);
  });
  frameImage.addEventListener("pointerup", event => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x, dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) stepFrame(dx < 0 ? 1 : -1);
  });
  frameImage.addEventListener("pointercancel", () => { swipeStart = null; });

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
  $("#choose-frame").addEventListener("click", () => {
    detailed.elements.frame.checked = true;
    $(".order-details").open = true;
    $("#order").scrollIntoView({ block: "start" });
    detailed.elements.contact.focus({ preventScroll: true });
  });

  // Both forms use the same PHP endpoint with independent request IDs.
  let sendingOrder = false;
  const orderRequestIds = new WeakMap();
  const sentForms = new WeakSet();
  forms.forEach((form) => {
    form.addEventListener("input", (e) => {
      const field = e.target;
      if (["contact", "name", "comment"].includes(field.name))
        forms
          .filter((f) => f !== form)
          .forEach((f) => {
            if (f.elements[field.name])
              f.elements[field.name].value = field.value;
          });
      field.removeAttribute("aria-invalid");
      $(".form-status", form).textContent = "";
    });
    form.addEventListener("submit", async (e) => {
      if (sendingOrder || sentForms.has(form)) { e.preventDefault(); return; }
      e.preventDefault();
      const status = $(".form-status", form);
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
      const contact = form.elements.contact;
      const value = contact.value.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isHandle = /^@[a-z\d_]{5,32}$/i.test(value);
      const isPhone =
        /^[+\d\s()−–-]+$/.test(value) &&
        value.replace(/\D/g, "").length >= 10 &&
        value.replace(/\D/g, "").length <= 15;
      if (!isEmail && !isHandle && !isPhone) {
        status.textContent =
          "Укажите телефон с кодом страны, email или имя в Telegram в формате @username.";
        contact.setAttribute("aria-invalid", "true");
        contact.focus();
        return;
      }
      if (!form.elements.consent.checked) {
        status.textContent = "Отметьте согласие с условиями обработки данных.";
        form.elements.consent.focus();
        return;
      }
      const endpoint = new URL(window.ARTNAHODKA_CONFIG.orderEndpoint, location.href);
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
      payload.append("selectedWork", selectedWork ? `${selectedWork.title} (${selectedWork.id || ""})` : "");
      files.forEach(({file}) => payload.append("photos[]", file, file.name));
      const button = form.querySelector('[type="submit"]');
      const originalLabel = button.textContent;
      sendingOrder = true; button.disabled = true;
      form.setAttribute("aria-busy", "true");
      button.textContent = "Отправляем…";
      status.textContent = "Загружаем фотографии и отправляем заявку. Дождитесь подтверждения.";
      try {
        const response = await fetch(endpoint.href, {method: "POST", body: payload, credentials: "omit"});
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.ok !== true || result.orderId !== orderRequestId) {
          if (response.status === 422 || response.status === 413) orderRequestIds.delete(form);
          throw new Error(result?.error || (response.status === 413 ? "Файлы превышают лимит хостинга. Уменьшите размер фотографий." : "Сервер не подтвердил отправку. Данные остались в форме."));
        }
        status.textContent = `Заявка отправлена! Номер: ${result.orderId}. Мы свяжемся с вами по указанному контакту.`;
        sentForms.add(form);
        button.textContent = "Заявка отправлена";
        // Keep this request ID so an accidental retry cannot send a duplicate.
        button.disabled = true;
      } catch (error) {
        status.textContent = error instanceof TypeError ? "Не удалось подтвердить отправку. Проверьте соединение и повторите попытку: повторная заявка не создаст дубликат." : error.message;
        button.textContent = originalLabel; button.disabled = false;
      } finally {
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

  const banner = $("#cookie-banner");
  let cookieDismissed = false;
  try {
    cookieDismissed =
      localStorage.getItem("artnahodka-essential-notice") === "dismissed";
  } catch {}
  banner.hidden = cookieDismissed;
  $("#cookie-accept").addEventListener("click", () => {
    banner.hidden = true;
    try {
      localStorage.setItem("artnahodka-essential-notice", "dismissed");
    } catch {}
  });
  $("#cookie-settings").addEventListener("click", () => {
    banner.hidden = false;
    $("#cookie-accept").focus();
  });
})();
