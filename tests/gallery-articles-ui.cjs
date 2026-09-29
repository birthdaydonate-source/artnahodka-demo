const assert = require('node:assert/strict');
const startServer = require('./test-server.cjs');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/works.js'), 'utf8'), sandbox);
const works = sandbox.window.ARTNAHODKA_WORKS;
const family = works.filter(w => w.tags.includes('family-composite'));
assert.equal(new Set(works.map(w => w.id)).size, works.length, 'unique gallery IDs');
const caricatures = works.filter(w => w.tags.includes('caricatures'));
assert.equal(caricatures.length, 8);
assert.equal(caricatures.filter(w => w.title.startsWith('Мягкий')).length, 4);
assert.equal(caricatures.filter(w => w.title.startsWith('Выразительный')).length, 4);
for (const work of caricatures) {
  assert.equal(work.images.length, 3);
  for (const image of work.images) {
    for (const field of ['src', 'thumb']) assert.ok(fs.existsSync(path.join(root, image[field])), image[field]);
  }
}
const metrika = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<!-- Yandex.Metrika counter -->[\s\S]*?<!-- \/Yandex.Metrika counter -->/)[0];
for (const page of ['messenger.html', 'articles/index.html', 'articles/family-from-photos.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.ok(html.includes(metrika), `same Metrika on ${page}`);
  assert.equal((html.match(/src="[^\"]*vk-pixel\.js/g) || []).length, 1);
}
const server = startServer(root, 18768);
let browser;
(async () => {
  await server.ready;
  browser = await chromium.launch({ headless: true });
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], missing = [], tracking = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'top-fwz1.mail.ru') tracking.push(url.href);
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    await page.goto('http://127.0.0.1:18768/index.html?topic=caricatures#examples');
    await page.locator('[data-topic="caricatures"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#gallery .work').count(), 8);
    assert.match(await page.locator('#gallery-count').textContent(), /8 работ/);
    assert.match(await page.locator('#gallery .work__label').first().textContent(), /3 изображения · пример стилизации · нажмите, чтобы рассмотреть/);
    await page.locator('#cookie-accept').click();
    await page.locator('[data-work="caricature-teacher"] .work__main').click();
    await page.locator('#viewer-dialog[open]').waitFor();
    assert.match(await page.locator('#viewer-image').getAttribute('src'), /caricature-teacher-art/);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(root, `test-results/caricatures-${width}.png`) });
    if (width < 1000) await page.locator('.menu-button').click();
    const nav = page.locator(width < 1000 ? '#mobile-nav' : '.desktop-nav');
    await nav.locator('[data-articles-menu] > summary').click();
    await nav.locator('.article-menu__section > summary').click();
    await nav.getByRole('link', { name: 'Семья из разных фото', exact: true }).click();
    await page.waitForURL('**/articles/family-from-photos.html');
    assert.deepEqual(await page.locator('.article-project').evaluateAll(cards => cards.map(card => card.dataset.work)), Array.from(family, work => work.id));
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
    await page.screenshot({ path: path.join(root, `test-results/family-article-${width}.png`) });
    await page.locator('.article-hero [data-open-index="1"]').click();
    await page.locator('#article-viewer[open]').waitFor();
    assert.match(await page.locator('#article-viewer-image').getAttribute('src'), /family-six-grandchildren-art-v2/);
    await page.locator('#article-viewer-next').click();
    assert.match(await page.locator('#article-viewer-image').getAttribute('src'), /family-six-grandchildren-result/);
    await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('#article-viewer-image').getAttribute('src'), /family-six-grandchildren-source-v2/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#article-viewer').evaluate(d => d.open), false);
    await page.locator('.article-hero [data-open-index="0"]').click();
    assert.match(await page.locator('#article-viewer-image').getAttribute('src'), /family-six-grandchildren-source-v2/);
    await page.keyboard.press('Escape');
    for (const project of await page.locator('.article-project').all()) {
      const id = await project.getAttribute('data-work');
      const work = family.find(work => work.id === id);
      await project.locator('.article-project__main').click();
      assert.equal(await page.locator('#article-viewer-position').textContent(), `Изображение 1 / ${work.images.length}`);
      assert.equal(await page.locator('#article-viewer-image').getAttribute('src'), `../${work.images[0].src}`);
      await page.locator('#article-viewer-prev').click();
      assert.equal(await page.locator('#article-viewer-image').getAttribute('src'), `../${work.images.at(-1).src}`);
      await page.locator('#article-viewer-close').click();
    }
    const images = await page.locator('.article-project img').evaluateAll(list => list.map(image => image.getAttribute('src')));
    for (const src of new Set(images)) assert.equal((await page.request.get(new URL(src, page.url()).href)).status(), 200, src);
    await page.getByRole('link', { name: 'Все семейные примеры ↗' }).click();
    await page.locator('[data-topic="family-composite"][aria-pressed="true"]').waitFor();
    assert.match(await page.locator('#gallery-count').textContent(), /12 работ/);
    await page.goto('http://127.0.0.1:18768/articles/');
    assert.equal(await page.locator('.footer-main .messengers a').count(), 2);
    assert.equal(await page.locator('.footer-address iframe').count(), 1);
    await page.getByRole('link', { name: 'Читать статью' }).click();
    await page.waitForURL('**/articles/family-from-photos.html');
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(tracking, [], 'VK disabled on test host');
    await page.close();
  }
  console.log('Eight caricatures, all family projects, before/after hero, full footer and image viewers passed at 1280px and 390px.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); });
