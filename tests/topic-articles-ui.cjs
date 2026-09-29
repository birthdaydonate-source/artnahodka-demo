const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const startServer = require('./test-server.cjs');
const root = path.resolve(__dirname, '..');
const topics = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/article-topics.json'), 'utf8'));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/works.js'), 'utf8'), sandbox);
const works = sandbox.window.ARTNAHODKA_WORKS;
const baseHTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const metrika = baseHTML.match(/<!-- Yandex.Metrika counter -->[\s\S]*?<!-- \/Yandex.Metrika counter -->/)[0];
const footer = text => text.match(/<footer[\s\S]*?<\/footer>/)[0];
const counts = { 'interior-art': 15, caricatures: 8, 'pet-portraits': 19, 'teacher-gift': 6, 'dream-art': 109 };
const extras = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/article-extra-projects.json'), 'utf8'));
const images = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/article-images.json'), 'utf8'));
assert.equal(new Set(extras.map(work => work.id)).size, 14);
assert.equal(extras.filter(work => work.category === 'interior').length, 10);
const teachers = extras.filter(work => work.category === 'teacher');
assert.equal(teachers.filter(work => work.gender === 'male').length, 2);
assert.deepEqual(teachers.filter(work => work.gender === 'female').map(work => work.age).sort(), ['senior', 'young']);
for (const work of extras) for (const [key] of work.imageKeys) {
  assert.ok(images[key], `image metadata: ${key}`);
  for (const variant of ['src', 'thumb']) assert.ok(fs.existsSync(path.join(root, images[key][variant])), `image asset: ${key} ${variant}`);
}
for (const topic of topics) {
  const filename = path.join(root, 'articles', topic.slug + '.html');
  const html = fs.readFileSync(filename, 'utf8');
  assert.equal(footer(html).replaceAll('../assets/', 'assets/').replace('href="../index.html#top"', 'href="#top"'), footer(baseHTML));
  assert.ok(html.includes(metrika), 'original Metrika block');
  assert.equal((html.match(/src="[^"]*vk-pixel\.js/g) || []).length, 1);
  assert.equal((html.match(/data-work="/g) || []).length, counts[topic.slug]);
  assert.ok(html.includes(`https://artnahodka.ru/articles/${topic.slug}.html`));
  assert.ok(!html.includes('Кто будет на портрете и каким вы его представляете'));
  for (const match of html.matchAll(/(?:src|href|data-full)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    if (/^(https?:|tel:|mailto:)/.test(match[1])) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(filename), match[1])), `${topic.slug}: ${match[1]}`);
  }
}
const photo = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64') };
const server = startServer(root, 18770);
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
    const requests = [];
    await page.route('**/api/order.php', async route => {
      const body = route.request().postData();
      const id = body.match(/name="requestId"\r\n\r\n([a-f0-9]{32})/)[1];
      requests.push(body);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, orderId: id, summary: { 'Размер': '40×40', 'Фотографий': 1 } }) });
    });
    await page.goto('http://127.0.0.1:18770/articles/');
    await page.locator('#cookie-accept').click();
    assert.equal(await page.locator('.articles-card').count(), 6);
    await page.screenshot({ path: path.join(root, `test-results/articles-index-${width}.png`) });
    for (const topic of topics) {
      await page.goto(`http://127.0.0.1:18770/articles/${topic.slug}.html`);
      await page.locator('#price-size option[value="40×40"]').waitFor({ state: 'attached' });
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), topic.slug + ' no overflow');
      assert.equal(await page.locator('#order .contact-card a').count(), 2);
      assert.equal(await page.locator('#projects .article-project:visible').count(), Math.min(counts[topic.slug], width < 700 ? 10 : 9));
      await page.screenshot({ path: path.join(root, `test-results/${topic.slug}-${width}.png`) });
      await page.locator('.article-comparison__source').click();
      await page.locator('#article-viewer[open]').waitFor();
      assert.match(await page.locator('#article-viewer-position').textContent(), /1 \/ 3/);
      await page.locator('#article-viewer-next').click();
      const heroSrc = await page.locator('.article-comparison__result img').getAttribute('src');
      assert.equal(await page.locator('#article-viewer-image').getAttribute('src'), heroSrc);
      await page.locator('#article-viewer-next').click();
      assert.match(await page.locator('#article-viewer-image').getAttribute('src'), /room/);
      await page.keyboard.press('Escape');
      if (topic.slug === 'interior-art') {
        assert.deepEqual(await page.locator('.article-space h3').allTextContents(), ['Кухня', 'Спальня', 'Гостиная', 'Кабинет', 'Терраса', 'Коридор и прихожая']);
        assert.equal(await page.locator('.article-photo-journey button').count(), 3);
        for (const button of await page.locator('.article-space button, .article-photo-journey button').all()) {
          const expected = await button.locator('img').getAttribute('src');
          await button.click();
          await page.locator('#article-viewer[open]').waitFor();
          assert.equal(await page.locator('#article-viewer-image').getAttribute('src'), expected);
          await page.waitForFunction(() => { const img = document.querySelector('#article-viewer-image'); return img.complete && img.naturalWidth > 0; });
          await page.keyboard.press('Escape');
        }
        await page.locator('#spaces').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, `test-results/interior-spaces-${width}.png`) });
        await page.locator('[data-project-more]').click();
        assert.equal(await page.locator('.article-project:visible').count(), 15);
        assert.equal(await page.locator('[data-project-more]').isVisible(), false);
      }
      if (topic.slug === 'teacher-gift') {
        assert.equal(await page.locator('.article-classroom button').count(), 4);
        for (const button of await page.locator('.article-classroom button').all()) {
          const expected = await button.locator('img').getAttribute('src');
          await button.click();
          await page.locator('#article-viewer[open]').waitFor();
          assert.equal(await page.locator('#article-viewer-image').getAttribute('src'), expected);
          assert.match(await page.locator('#article-viewer-position').textContent(), /3 \/ 3/);
          await page.waitForFunction(() => { const img = document.querySelector('#article-viewer-image'); return img.complete && img.naturalWidth > 0; });
          await page.keyboard.press('Escape');
        }
        await page.locator('#classroom').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, `test-results/teacher-classroom-${width}.png`) });
      }
      if (topic.slug === 'pet-portraits') {
        await page.locator('[data-project-more]').click();
        assert.equal(await page.locator('.article-project:visible').count(), width < 700 ? 19 : 18);
      }
      if (topic.slug === 'dream-art') {
        for (const tag of ['dreamart', 'painterly']) {
          await page.locator(`[data-project-filter="${tag}"]`).click();
          const expected = works.filter(w => w.tags.includes(tag)).length;
          assert.match(await page.locator('[data-project-count]').textContent(), new RegExp(`из ${expected}$`));
          while (await page.locator('[data-project-more]').isVisible()) await page.locator('[data-project-more]').click();
          assert.equal(await page.locator('.article-project:visible').count(), expected);
        }
      }
      await page.locator('#projects .article-project:visible .article-project__main').first().click();
      await page.locator('#article-viewer[open]').waitFor();
      await page.locator('#article-viewer-close').click();
      if (width < 1000) await page.locator('.menu-button').click();
      const nav = page.locator(width < 1000 ? '#mobile-nav' : '.desktop-nav');
      await nav.locator('[data-articles-menu] > summary').click();
      assert.equal(await nav.locator('.article-menu__section a').count(), 6);
      await page.keyboard.press('Escape');
      await page.locator('#price-size').selectOption('40×40');
      await page.locator('#choose-size').click();
      const form = page.locator('#detailed-form');
      assert.equal(await form.locator('[name=size]').inputValue(), '40×40');
      assert.equal(await form.locator('[name=orientation]').inputValue(), 'Квадратная');
      await form.locator('input[type=file]').setInputFiles(photo);
      await form.locator('[name=contactMethod]').selectOption('max');
      await form.locator('[name=phone]').fill('+7 (999) 123-45-67');
      await form.locator('[name=comment]').fill('Тест темы: ' + topic.title);
      await form.locator('[name=consent]').check();
      await form.locator('[type=submit]').click();
      await page.getByRole('button', { name: 'Заявка отправлена', exact: true }).waitFor();
      assert.ok(requests.at(-1).includes(`${topic.title} — заявка со статьи (${topic.slug})`), 'order identifies correct topic');
      assert.ok(!requests.at(-1).includes('Семья из разных фото — заявка со статьи'));
    }
    assert.equal(requests.length, 5);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(tracking, []);
    await page.close();
  }
  console.log('Five topic pages: original analytics/footer, assets, galleries, image viewers, navigation, prices and topic-specific orders passed at 1280px and 390px.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); });
