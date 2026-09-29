const assert = require('node:assert/strict');

module.exports = async function assertArticleToc(page) {
  async function currentIs(id) {
    try {
      await page.waitForFunction(expected => {
        const current = document.querySelectorAll('.article-toc a[aria-current="location"]');
        return current.length === 1 && current[0].hash === '#' + expected;
      }, id, { timeout: 5000 });
    } catch (error) {
      console.error('TOC expected:', id, await page.evaluate(() => ({
        width: innerWidth, hash: location.hash,
        current: document.querySelector('.article-toc [aria-current]')?.hash,
        positions: [...document.querySelectorAll('.article-toc a')].map(link => ({
          hash: link.hash, top: document.querySelector(link.hash).getBoundingClientRect().top,
        })),
      })));
      throw error;
    }
  }
  await page.locator('.article-toc a[href="#photos"]').click();
  await currentIs('photos');
  const hash = new URL(page.url()).hash;
  await page.locator('#example').evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await currentIs('example');
  assert.equal(new URL(page.url()).hash, hash, 'scrolling keeps URL and history intact');
  await page.locator('#idea').evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await currentIs('idea');
  await page.locator('#projects').evaluate(section => section.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await currentIs('projects');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => !document.querySelector('.article-toc [aria-current]'));
};
