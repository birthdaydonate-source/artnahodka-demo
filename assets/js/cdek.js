"use strict";
(() => {
  const form = document.getElementById("detailed-form");
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const dialog = $("cdek-dialog"), button = $("choose-cdek");
  const cityInput = form.elements.city, delivery = form.elements.delivery;
  const address = form.elements.cdekAddress;
  const fields = ["cdekPvzCode", "cdekCityCode", "cdekCity"];
  const search = $("cdek-city-search"), cities = $("cdek-city-select");
  const addressSearch = $("cdek-address-search"), list = $("cdek-list");
  const status = $("cdek-dialog-status"), confirm = $("cdek-confirm");
  const layout = dialog.querySelector(".cdek-layout");
  const settings = window.ARTNAHODKA_CONFIG.cdek;
  const normalize = (s) => String(s).toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
  let directory, dataPromise, mapsPromise, map, cluster, marks = new Map();
  let selectedCity, selectedOffice, currentOffices = [], generation = 0;

  function clearSelection() {
    address.value = "";
    fields.forEach((name) => { form.elements[name].value = ""; });
    button.textContent = "Выбрать пункт на карте";
  }
  function syncDelivery() {
    fields.forEach((name) => { form.elements[name].disabled = delivery.value !== "cdek"; });
    if (delivery.value !== "cdek") {
      clearSelection();
      if (dialog.open) dialog.close();
    }
  }
  cityInput.addEventListener("input", clearSelection);
  cityInput.addEventListener("change", () => {
    if (form.elements.cdekCity.value && cityInput.value !== form.elements.cdekCity.value) clearSelection();
  });
  delivery.addEventListener("change", syncDelivery);
  form.addEventListener("reset", () => { clearSelection(); if (dialog.open) dialog.close(); setTimeout(syncDelivery, 0); });
  syncDelivery();

  function getDirectory() {
    if (!dataPromise) dataPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(settings.directoryUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("directory");
        const data = await response.json();
        if (!Array.isArray(data.cities) || !data.offices) throw new Error("directory-format");
        return data;
      } finally { clearTimeout(timeout); }
    })().catch((error) => { dataPromise = null; throw error; });
    return dataPromise;
  }

  function loadMaps() {
    if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
    if (mapsPromise) return mapsPromise;
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => fail(), 20000);
      function fail() { clearTimeout(timeout); script.remove(); reject(new Error("maps")); }
      script.src = "https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=" + encodeURIComponent(settings.yandexMapsApiKey);
      script.onerror = fail;
      script.onload = () => {
        if (!window.ymaps) return fail();
        window.ymaps.ready(() => { clearTimeout(timeout); resolve(window.ymaps); });
      };
      document.head.append(script);
    }).catch((error) => { mapsPromise = null; throw error; });
    return mapsPromise;
  }

  function destroyMap() {
    if (map) map.destroy();
    map = null; cluster = null; marks.clear();
    $("cdek-map").replaceChildren();
  }
  function resetChoice() {
    selectedOffice = null; confirm.disabled = true;
    $("cdek-selected").textContent = "Выберите пункт на карте или в списке.";
  }
  function selectOffice(office) {
    selectedOffice = office;
    confirm.disabled = false;
    $("cdek-selected").textContent = selectedCity[1] + ", " + office[1];
    list.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.code === office[0])));
    marks.forEach((mark, code) => mark.options.set("preset", code === office[0] ? "islands#redDotIcon" : "islands#darkGreenDotIcon"));
  }
  function renderList() {
    list.replaceChildren();
    const query = normalize(addressSearch.value);
    const filtered = currentOffices.filter((o) => normalize(o[1] + " " + o[0]).includes(query));
    for (const office of filtered) {
      const item = document.createElement("button");
      item.type = "button"; item.className = "cdek-office"; item.dataset.code = office[0];
      item.setAttribute("aria-pressed", String(selectedOffice?.[0] === office[0]));
      const title = document.createElement("strong"), hours = document.createElement("small");
      title.textContent = office[1]; hours.textContent = office[4];
      item.append(title, hours);
      item.addEventListener("click", () => {
        selectOffice(office);
        if (map) map.setCenter([office[3], office[2]], 16, { duration: 200 });
      });
      list.append(item);
    }
    if (!filtered.length) {
      const empty = document.createElement("p"); empty.textContent = "По этому адресу пунктов не найдено. Попробуйте другую улицу."; list.append(empty);
    }
  }
  async function showCity() {
    const ticket = ++generation;
    destroyMap(); resetChoice(); addressSearch.value = "";
    selectedCity = directory.cities.find((c) => String(c[0]) === cities.value);
    layout.hidden = !selectedCity;
    if (!selectedCity) { status.textContent = "Выберите населённый пункт из списка."; return; }
    currentOffices = directory.offices[String(selectedCity[0])] || [];
    renderList();
    status.textContent = "Пунктов в городе: " + currentOffices.length + ". Загружаем карту…";
    if (!currentOffices.length) { status.textContent = "В этом городе пока нет доступных пунктов выдачи."; return; }
    try {
      const ymaps = await loadMaps();
      if (ticket !== generation || !dialog.open) return;
      const first = currentOffices[0];
      map = new ymaps.Map("cdek-map", { center: [first[3], first[2]], zoom: 13, controls: ["zoomControl"] });
      cluster = new ymaps.Clusterer({ preset: "islands#darkGreenClusterIcons", clusterDisableClickZoom: false, clusterOpenBalloonOnClick: false });
      for (const office of currentOffices) {
        const mark = new ymaps.Placemark([office[3], office[2]], {}, { preset: "islands#darkGreenDotIcon" });
        mark.events.add("click", () => {
          addressSearch.value = ""; selectOffice(office); renderList();
          const item = [...list.children].find((el) => el.dataset.code === office[0]);
          item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        marks.set(office[0], mark); cluster.add(mark);
      }
      map.geoObjects.add(cluster);
      if (currentOffices.length > 1) await map.setBounds(cluster.getBounds(), { checkZoomRange: true, zoomMargin: 35 });
      if (ticket === generation) status.textContent = "Пунктов в городе: " + currentOffices.length + ". Выберите отметку на карте или адрес в списке.";
    } catch (_) {
      if (ticket !== generation || !dialog.open) return;
      destroyMap();
      $("cdek-map").textContent = "Карта временно недоступна. Выберите пункт из списка адресов.";
      status.textContent = "Доступен выбор из списка: " + currentOffices.length + " пунктов.";
    }
  }
  function filterCities(autoSelect = false) {
    const query = normalize(search.value);
    const exact = directory.cities.filter((c) => normalize(c[1]) === query || normalize(c[1] + ", " + c[2]) === query);
    const matches = exact.length ? exact : directory.cities.filter((c) => normalize(c[1] + " " + c[2]).includes(query));
    cities.replaceChildren(new Option(matches.length ? "Выберите населённый пункт" : "Город не найден", ""));
    matches.slice(0, 100).forEach((c) => cities.add(new Option(c[1] + ", " + c[2], String(c[0]))));
    if (autoSelect && matches.length === 1) cities.value = String(matches[0][0]);
    if (matches.length > 100) status.textContent = "Уточните название города — найдено больше 100 населённых пунктов.";
    showCity();
    if (!matches.length) status.textContent = "В справочнике нет пунктов для этого города. Проверьте название или выберите ближайший населённый пункт.";
  }
  search.addEventListener("input", () => { if (directory) filterCities(true); });
  cities.addEventListener("change", showCity);
  addressSearch.addEventListener("input", renderList);

  button.addEventListener("click", async () => {
    if (delivery.value !== "cdek") return;
    if (!cityInput.value.trim()) {
      cityInput.setAttribute("aria-invalid", "true");
      $("city-error").textContent = "Сначала укажите город для выбора пункта СДЭК.";
      $("city-error").hidden = false; cityInput.focus(); return;
    }
    if (dialog.open) return;
    dialog.showModal(); document.body.classList.add("dialog-open");
    const ticket = ++generation;
    layout.hidden = true; resetChoice();
    search.value = cityInput.value.trim(); cities.replaceChildren();
    search.disabled = true; cities.disabled = true;
    status.textContent = "Загружаем справочник пунктов СДЭК…";
    try {
      directory = await getDirectory();
      if (ticket !== generation || !dialog.open) return;
      search.disabled = false; cities.disabled = false;
      $("cdek-source").textContent = "Справочник СДЭК от " + new Date(directory.updatedAt).toLocaleDateString("ru-RU");
      filterCities(true);
    } catch (_) {
      if (ticket === generation && dialog.open) status.textContent = "Не удалось загрузить пункты. Проверьте соединение и откройте карту ещё раз.";
    }
  });
  dialog.addEventListener("close", () => { ++generation; destroyMap(); resetChoice(); button.focus(); });
  confirm.addEventListener("click", () => {
    if (!selectedCity || !selectedOffice || delivery.value !== "cdek") return;
    const label = selectedCity[1] + ", " + selectedCity[2];
    cityInput.value = label;
    form.elements.cdekCity.value = label;
    form.elements.cdekCityCode.value = String(selectedCity[0]);
    form.elements.cdekPvzCode.value = selectedOffice[0];
    address.value = selectedCity[1] + ", " + selectedOffice[1];
    address.dispatchEvent(new Event("input", { bubbles: true }));
    cityInput.removeAttribute("aria-invalid"); $("city-error").hidden = true;
    button.textContent = "Изменить пункт";
    dialog.close();
  });
})();
