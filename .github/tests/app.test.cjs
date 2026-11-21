const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { before, after, test } = require('node:test');
const vm = require('node:vm');
const playwright = require('playwright');

const root = path.resolve(__dirname, '../..');
const project = '/n5-master-hub-forbegginer/';
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const release = index.match(/<meta name="n5-release" content="([^"]+)">/)[1];
const nextRelease = release + '-test';
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const engine = process.env.N5_TEST_BROWSER || 'chromium';
const mockPath = project + 'mock-supabase';
let mockCloud;
let browser, site;
let networkAvailable = true;
let published = release;
let missingIcon = false;
let staleShell = false;
let shellRequests = 0;

const server = http.createServer((request, response) => {
  if (!networkAvailable) return response.writeHead(503).end();
  const url = new URL(request.url, site);
  const {pathname} = url;
  if (pathname.startsWith(mockPath + '/')) {
    if (!mockCloud) return response.writeHead(503).end();
    mockCloud(request, response, url).catch(error => {
      console.error(error.message);
      response.writeHead(500).end();
    });
    return;
  }
  const name = pathname.slice(project.length) || 'index.html';
  const file = path.resolve(root, name);
  const mime = types[path.extname(name)];
  if (!pathname.startsWith(project) || !file.startsWith(root + path.sep) || !mime ||
    !fs.existsSync(file) || (missingIcon && name === 'assets/icons/app-512.png')) {
    return response.writeHead(404).end();
  }
  if (name === 'index.html' && published === nextRelease) shellRequests++;
  const content = name === 'index.html'
    ? fs.readFileSync(file, 'utf8').replace(/const N5_CLOUD_URL='[^']+';/, `const N5_CLOUD_URL='${new URL(mockPath, site)}';`)
    : fs.readFileSync(file);
  const next = published === nextRelease && (name === 'sw.js' || (name === 'index.html' && !staleShell));
  if (name === 'index.html' && !content.includes(`const N5_CLOUD_URL='${new URL(mockPath, site)}';`)) {
    return response.writeHead(500).end();
  }
  response.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'no-store'});
  response.end(next ? content.toString('utf8').replaceAll(release, nextRelease) : content);
});

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  site = `http://localhost:${server.address().port}${project}`;
  const executablePath = process.env.N5_TEST_BROWSER_PATH || undefined;
  browser = await playwright[engine].launch({executablePath});
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
});

async function openApp(t, contextOptions) {
  const context = await browser.newContext(contextOptions);
  t.after(() => context.close());
  await context.route('**/*', route =>
    route.request().url().startsWith(site) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(site, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  return {context, page};
}

async function go(page, view) {
  await page.evaluate(view => navigateTo(view), view);
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'), view);
  assert((await page.locator('#mainContainer').innerText()).trim());
}

test('release metadata, scripts and PWA assets match', () => {
  assert(index.includes(`<title>N5 Master Hub v${release}</title>`));
  assert(index.includes(`N5Hub-${release}`));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(worker.includes(`const RELEASE = '${release}'`));
  for (const icon of manifest.icons) {
    assert(fs.existsSync(path.join(root, icon.src)));
    assert(worker.includes(icon.src.slice(2)));
  }
  new vm.Script(worker);
  new vm.Script(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'));
  for (const script of index.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});

test('bounded edit distance agrees with the full matrix for short inputs', () => {
  const source = index.slice(index.indexOf('    function searchEditDistance('), index.indexOf('    function fuzzySearchScore('));
  const distance = vm.runInNewContext(source + '; searchEditDistance');
  const strings = ['', 'a', 'b', 'あ', 'aa', 'ab', 'ba', 'aba', 'bbあ', 'aあb', 'あab', 'babaab', 'ababaab', 'ああab'];
  for (const a of strings) for (const b of strings) {
    let row = Array.from({length:b.length+1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const previous = row;
      row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(previous[j]+1, row[j-1]+1, previous[j-1]+Number(a[i-1]!==b[j-1]));
      }
    }
    for (const limit of [1,2]) assert.equal(distance(a,b,limit), Math.min(row[b.length],limit+1), JSON.stringify({a,b,limit}));
  }
});

test('mobile and desktop study, Romaji, IME, deep link and legacy backup', {timeout: 90_000}, async t => {
  const {page, context} = await openApp(t, {...playwright.devices['iPhone 13'], colorScheme: 'light'});
  assert(await page.locator('#mobileBottomNav').isVisible());
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));

  const search = page.locator('#globalSearchInput');
  await search.dispatchEvent('compositionstart');
  await search.fill('食べ');
  assert.equal(await page.evaluate(() => state.globalSearchActive), false);
  await search.fill('食べませんでした');
  await search.dispatchEvent('compositionend');
  await page.waitForFunction(() => document.getElementById('mainContainer').dataset.n5Page === 'global-search');
  assert.equal(await page.locator('#mainContainer h1').textContent(), 'Kết quả cho “食べませんでした”');
  for (const query of ['tabemasendeshita', 'tabemasu', '食べませんでした']) {
    assert(await page.evaluate(q => n5SmartAnalyze(q)?.parts.some(part => part.base === 'たべる'), query));
  }
  assert(await page.evaluate(() => getCachedGlobalSearchResults('nihongoo').length > 0));

  const late = await page.evaluate(() => {
    clearGlobalSearch();
    const target = N5_ALL_VOCAB.at(-1);
    openGlobalSearchResult('vocab', target.id);
    return {id:target.id, chunk:VOCAB_CHUNK};
  });
  assert.equal(await page.locator(`#search-item-${late.id}`).count(), 1);
  assert(await page.locator('#vocabTableBody tr').count() <= late.chunk);
  await page.getByRole('button', {name:'Hiện các từ phía trước'}).click();
  assert(await page.locator('#vocabTableBody tr').count() > late.chunk);

  for (const view of ['dashboard','vocab','kanji','grammar','formPractice','numberGuide','flashcard','quiz','bookmarks',
    'review','mistakes','analytics','backup','kanjiWrite','shadowing','srs','conjugation','reading','listening','mockExam','translator']) {
    await go(page, view);
  }
  await go(page, 'flashcard');
  await page.locator('#flashcardElement').click();
  assert(await page.locator('#flashcardElement').evaluate(el => el.classList.contains('rotate-y-180')));
  const backup = await page.evaluate(() => {
    const id = VOCAB_DATA[0].id;
    toggleBookmark(id);
    saveFlashcardKnowledge(id, false);
    return {...n5BackupPayload(), version:'N5Hub-5.46'};
  });
  await go(page, 'backup');
  await page.locator('input[onchange="importHubData(event)"]').setInputFiles({
    name:'v546.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))
  });
  await page.getByText('Đã khôi phục dữ liệu học').waitFor();
  assert.deepEqual(await page.evaluate(() => n5BackupPayload().reviewData), backup.reviewData);

  const desktop = await context.newPage();
  await desktop.setViewportSize({width:1280,height:800});
  await desktop.goto(site);
  assert.equal(await desktop.locator('#mobileBottomNav').isVisible(), false);
  assert(await desktop.locator('#sidebar').isVisible());
});

test('evicted cache recovers; failed updates preserve offline study and retry across tabs', {timeout: 90_000}, async t => {
  t.after(() => {networkAvailable = true; published = release; missingIcon = false; staleShell = false;});
  const {context, page} = await openApp(t);
  const id = await page.evaluate(() => {
    const id = VOCAB_DATA[0].id;
    toggleBookmark(id);
    return id;
  });
  const cacheName = 'n5-master-hub:' + project + ':' + release;
  await page.evaluate(name => caches.delete(name), cacheName);
  assert.equal((await page.reload()).status(), 200);
  await page.waitForFunction(async name => Boolean(await caches.match(location.pathname + 'index.html', {cacheName:name})), cacheName);

  networkAvailable = false;
  assert.equal((await page.reload()).status(), 200);
  await go(page, 'vocab');
  assert.deepEqual(await page.evaluate(() => state.bookmarks), [id]);
  networkAvailable = true;

  const other = await context.newPage();
  await other.goto(site);
  await other.evaluate(() => caches.open('unrelated-cache'));
  await go(page, 'backup');
  const check = page.getByRole('button', {name:'Kiểm tra cập nhật'});
  const notice = page.locator('#n5-update');
  published = nextRelease;
  missingIcon = true;
  await check.click();
  await page.getByText(/Chưa tải được bản cập nhật/).first().waitFor();
  assert(await notice.isHidden());
  assert.equal(await page.title(), 'N5 Master Hub v' + release);

  missingIcon = false;
  staleShell = true;
  const reads = shellRequests;
  await check.click();
  for (let i = 0; i < 50 && shellRequests === reads; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert(shellRequests > reads);
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).installing);
  assert(await notice.isHidden());
  staleShell = false;
  await check.click();
  await notice.waitFor({state:'visible'});
  await notice.getByRole('button', {name:'Cập nhật và mở lại'}).click();
  await page.waitForFunction(r => document.title === 'N5 Master Hub v' + r, nextRelease);
  assert.equal(await other.title(), 'N5 Master Hub v' + release);
  await other.locator('#n5-update').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(() => state.bookmarks), [id]);
  assert.deepEqual((await page.evaluate(() => caches.keys())).sort(),
    ['n5-master-hub:' + project + ':' + nextRelease, 'unrelated-cache']);
});

test('mock Supabase: revision conflicts and a concurrent tab cannot overwrite progress', {timeout: 90_000}, async t => {
  const {context, page} = await openApp(t);
  const user = {id:'test-user', email:'learner@example.invalid'};
  let row, pauseRead;
  let pushes = 0;
  let refreshes = 0;
  mockCloud = async (request, response, url) => {
    const pathname = url.pathname.slice(mockPath.length);
    const reply = json => response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(json));
    if (pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') refreshes++;
      return reply({access_token:'mock-token',refresh_token:'mock-refresh',user,expires_in:refreshes?3600:1});
    }
    assert.equal(pathname, '/rest/v1/n5_user_data');
    assert.equal(request.headers.authorization, 'Bearer mock-token');
    if (request.method === 'GET') {
      if (pauseRead) await pauseRead();
      return reply(row ? [row] : []);
    }
    if (request.method === 'PATCH' && url.searchParams.get('revision') !== 'eq.' + row.revision) return reply([]);
    let body = '';
    for await (const chunk of request) body += chunk;
    row = JSON.parse(body);
    pushes++;
    return reply([row]);
  };
  t.after(() => {mockCloud = null;});
  await go(page, 'backup');
  await page.locator('#n5-cloud-email').fill(user.email);
  await page.locator('#n5-cloud-password').fill('mock-password');
  await page.getByRole('button', {name:'Đăng nhập', exact:true}).click();
  await page.waitForFunction(() => !n5CloudBusy);
  assert.match(await page.locator('#n5-cloud-status').textContent(), /Đã đăng nhập/);
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
  const status = page.locator('#n5-cloud-status');
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(row.revision, 1);
  assert.equal(refreshes, 1);

  await page.evaluate(() => n5CloudToggleAuto(true));
  await status.getByText(/Dữ liệu đã đồng nhất/).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {configurable:true, value:false});
    toggleBookmark(VOCAB_DATA[0].id);
    window.dispatchEvent(new Event('offline'));
  });
  assert.equal(pushes, 1);
  await page.evaluate(() => {
    delete navigator.onLine;
    window.dispatchEvent(new Event('online'));
  });
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(row.revision, 2);
  assert.equal(row.data.bookmarks.length, 1);
  await page.evaluate(() => n5CloudToggleAuto(false));

  await page.evaluate(() => toggleCompleted(VOCAB_DATA[0].id));
  row = {...row, revision:3, data:{...row.data, completedItems:['remote-edit']}};
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
  await status.getByText(/Xung đột/).waitFor();

  row = {...row, revision:4};
  await page.getByRole('button', {name:/Giữ bản thiết bị/}).click();
  await status.getByText(/Bản cloud đã thay đổi/).waitFor();
  assert.equal(pushes, 2);
  assert.equal(row.revision, 4);

  const other = await context.newPage();
  await other.goto(site);
  let permitRead;
  let readStarted;
  const started = new Promise(resolve => {readStarted = resolve;});
  pauseRead = () => new Promise(resolve => {permitRead = resolve; readStarted();});
  const sync = page.evaluate(() => n5CloudSync('cloud'));
  await started;
  await other.evaluate(() => toggleBookmark(VOCAB_DATA[1].id));
  await status.getByText(/tab khác/).waitFor();
  pauseRead = null;
  permitRead();
  await sync;
  assert.equal(pushes, 2);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('n5_hub_bookmarks')).length), 2);
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
  await status.getByText(/tab khác/).waitFor();
  assert.equal(await page.evaluate(async () =>
    (await (await caches.open('n5-master-hub:' + location.pathname + ':' + document.querySelector('[name=n5-release]').content)).keys())
      .some(request => request.url.includes('/mock-supabase/'))), false);
});
