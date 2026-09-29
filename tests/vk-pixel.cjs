const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/vk-pixel.js'), 'utf8');

function visit(hostname) {
  const scripts = [];
  const window = { location: { hostname }, _tmr: [{ id: 'other-counter', type: 'pageView' }] };
  const document = {
    getElementById: id => scripts.find(script => script.id === id),
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: script => scripts.push(script) } }],
  };
  const context = vm.createContext({ window, document });
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  return { scripts, views: window._tmr.filter(item => item.id === '3798068') };
}

for (const host of ['artnahodka.ru', 'www.artnahodka.ru']) {
  const result = visit(host);
  assert.equal(result.views.length, 1, host + ': one page view even if included twice');
  assert.equal(result.views[0].type, 'pageView');
  assert.equal(result.scripts.length, 1, host + ': one external loader');
  assert.equal(result.scripts[0].src, 'https://top-fwz1.mail.ru/js/code.js');
  assert.equal(result.scripts[0].async, true);
}

for (const host of ['birthdaydonate-source.github.io', 'localhost', '127.0.0.1', 'preview.artnahodka.ru', 'artnahodka.ru.example.com']) {
  const result = visit(host);
  assert.equal(result.views.length, 0, host + ': no production page views');
  assert.equal(result.scripts.length, 0, host + ': no external requests');
}
console.log('VK pixel: production hosts, preview exclusion and duplicate inclusion passed.');
