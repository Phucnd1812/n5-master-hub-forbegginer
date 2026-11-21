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
  assert(await page.getByText('Phiên bản đang chạy v' + release, {exact: true}).isVisible());
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

async function checkCandidate(page) {
  const check = page.getByRole('button', {name:'Kiểm tra cập nhật'});
  const reads = shellRequests;
  for (let attempt = 0; attempt < 5 && shellRequests === reads; attempt++) {
    await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).installing);
    await check.click();
    for (let i = 0; i < 10 && shellRequests === reads; i++) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(shellRequests > reads, 'the worker requested this candidate shell');
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).installing);
}

for (const failure of ['missing icon', 'stale HTML']) {
  test(`PWA keeps the active offline version after an update with ${failure}`, {timeout:90_000}, async t => {
    t.after(() => {networkAvailable = true; published = release; missingIcon = false; staleShell = false;});
    const {page} = await openApp(t);
    const id = await page.evaluate(() => {
      const id = VOCAB_DATA[0].id;
      toggleBookmark(id);
      return id;
    });

    // Use a fresh registration for each simulated deployment. The browser
    // can delay another update attempt after a failed worker installation.
    await go(page,'backup');
    published = nextRelease;
    missingIcon = failure === 'missing icon';
    staleShell = failure === 'stale HTML';
    await checkCandidate(page);
    await page.getByText(/Chưa tải được bản cập nhật/).first().waitFor();
    assert(await page.locator('#n5-update').isHidden());
    assert.equal(await page.title(), 'N5 Master Hub v' + release);

    networkAvailable = false;
    assert.equal((await page.reload()).status(), 200);
    await go(page, 'vocab');
    assert.deepEqual(await page.evaluate(() => state.bookmarks), [id]);
  });
}

test('PWA recovers an evicted cache and safely applies a valid update across tabs', {timeout:90_000}, async t => {
  t.after(() => {networkAvailable = true; published = release;});
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
  const notice = page.locator('#n5-update');
  published = nextRelease;
  await checkCandidate(page);
  await notice.waitFor({state:'visible'});
  await notice.getByRole('button', {name:'Cập nhật và mở lại'}).click();
  await page.waitForFunction(r => document.title === 'N5 Master Hub v' + r, nextRelease);
  assert.equal(await other.title(), 'N5 Master Hub v' + release);
  await other.locator('#n5-update').waitFor({state:'visible'});
  await go(other, 'backup');
  assert(await other.getByText('Phiên bản đang chạy v' + release, {exact: true}).isVisible());
  await go(page, 'backup');
  assert(await page.getByText('Phiên bản đang chạy v' + nextRelease, {exact: true}).isVisible());
  assert.deepEqual(await page.evaluate(() => state.bookmarks), [id]);
  assert.deepEqual((await page.evaluate(() => caches.keys())).sort(),
    ['n5-master-hub:' + project + ':' + nextRelease, 'unrelated-cache']);
});

function cloudFixture(t) {
  const db = {user:{id:'test-user',email:'learner@example.invalid'}, row:null, pauseRead:null, pushes:0, refreshes:0};
  mockCloud = async (request, response, url) => {
    const pathname = url.pathname.slice(mockPath.length);
    const reply = json => response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(json));
    if (pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') db.refreshes++;
      return reply({access_token:'mock-token',refresh_token:'mock-refresh',user:db.user,expires_in:db.refreshes?3600:1});
    }
    assert.equal(pathname, '/rest/v1/n5_user_data');
    assert.equal(request.headers.authorization, 'Bearer mock-token');
    if (request.method === 'GET') {
      if (db.pauseRead) await db.pauseRead();
      return reply(db.row ? [db.row] : []);
    }
    if (request.method === 'PATCH' && url.searchParams.get('revision') !== 'eq.' + db.row.revision) return reply([]);
    let body = '';
    for await (const chunk of request) body += chunk;
    db.row = JSON.parse(body);
    db.pushes++;
    return reply([db.row]);
  };
  t.after(() => {mockCloud = null;});
  return db;
}

async function cloudLogin(page,user) {
  await go(page, 'backup');
  await page.locator('#n5-cloud-email').fill(user.email);
  await page.locator('#n5-cloud-password').fill('mock-password');
  await page.getByRole('button', {name:'Đăng nhập', exact:true}).click();
  await page.waitForFunction(() => !n5CloudBusy);
  assert.match(await page.locator('#n5-cloud-status').textContent(), /Đã đăng nhập/);
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
}

test('mock Supabase: revision conflicts and a concurrent tab cannot overwrite progress', {timeout: 90_000}, async t => {
  const {context, page} = await openApp(t);
  await page.waitForFunction(() => Boolean(n5SmartStudy.snapshot()?.plan));
  const db = cloudFixture(t);
  await cloudLogin(page,db.user);
  const status = page.locator('#n5-cloud-status');
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(db.row.revision, 1);
  assert.equal(db.refreshes, 1);
  assert.equal(db.row.data.smartStudy.settings.minutes, 5);

  await page.evaluate(() => n5CloudToggleAuto(true));
  await status.getByText(/Dữ liệu đã đồng nhất/).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {configurable:true, value:false});
    toggleBookmark(VOCAB_DATA[0].id);
    window.dispatchEvent(new Event('offline'));
  });
  assert.equal(db.pushes, 1);
  await page.evaluate(() => {
    delete navigator.onLine;
    window.dispatchEvent(new Event('online'));
  });
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(db.row.revision, 2);
  assert.equal(db.row.data.bookmarks.length, 1);
  await page.evaluate(() => n5CloudToggleAuto(false));

  await page.evaluate(() => toggleCompleted(VOCAB_DATA[0].id));
  db.row = {...db.row, revision:3, data:{...db.row.data, completedItems:['remote-edit']}};
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
  await status.getByText(/Xung đột/).waitFor();

  db.row = {...db.row, revision:4};
  await page.getByRole('button', {name:/Giữ bản thiết bị/}).click();
  await status.getByText(/Bản cloud đã thay đổi/).waitFor();
  assert.equal(db.pushes, 2);
  assert.equal(db.row.revision, 4);

  const other = await context.newPage();
  await other.goto(site);
  let permitRead;
  let readStarted;
  const started = new Promise(resolve => {readStarted = resolve;});
  db.pauseRead = () => new Promise(resolve => {permitRead = resolve; readStarted();});
  const sync = page.evaluate(() => n5CloudSync('cloud'));
  await started;
  await other.evaluate(() => toggleBookmark(VOCAB_DATA[1].id));
  await status.getByText(/tab khác/).waitFor();
  db.pauseRead = null;
  permitRead();
  await sync;
  assert.equal(db.pushes, 2);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('n5_hub_bookmarks')).length), 2);
  await page.getByRole('button', {name:'Đồng bộ ngay'}).click();
  await status.getByText(/tab khác/).waitFor();
  assert.equal(await page.evaluate(async () =>
    (await (await caches.open('n5-master-hub:' + location.pathname + ':' + document.querySelector('[name=n5-release]').content)).keys())
      .some(request => request.url.includes('/mock-supabase/'))), false);
});

test('Smart Study priorities, duration and streak follow recorded evidence', () => {
  const sandbox = vm.createContext({});
  new vm.Script(fs.readFileSync(path.join(root, 'assets/study-engine.js'), 'utf8')).runInContext(sandbox);
  const study = sandbox.N5StudyEngine;
  const data = study.empty();
  const settings = JSON.stringify(data.settings);
  assert.deepEqual(JSON.parse(settings), {minutes:5,focus:'auto',method:'balanced',mix:[],tracking:true});
  const input = {completed:[], review:{}, mistakes:[], lessons:['Bài 1','Bài 2'], studyLog:[]};
  const prompts = Array.from({length:140}, (_,i) => ({
    id:'card:' + i, contentId:String(i), skill:i % 2 ? 'kanji' : 'vocab',
    drill:'card', title:'Thẻ ' + i, prompt:'Thẻ ' + i, answer:'Đáp án', seconds:60, lesson:i < 40 ? 'Bài 1' : 'Bài 2'
  }));
  for (const minutes of [5,15,25,45,60,73]) {
    const plan = study.chooseItems(prompts,input,data,{...data.settings,minutes});
    assert.equal(plan.length, minutes <= 5 ? 4 : minutes);
    assert(plan.every(p => p.reason === 'chapter' || p.reason === 'new'));
    assert.equal(new Set(plan.map(p => p.id)).size, plan.length);
  }
  input.review['4'] = {due:'2020-01-01',remembered:true};
  input.review['5'] = {due:'2099-01-01',remembered:false};
  input.mistakes.push({id:'6',mastered:false});
  const plan = study.chooseItems(prompts,input,data,{...data.settings,method:'review'}, {day:'2025-01-02'});
  assert.deepEqual(Array.from(plan, item => item.reason).slice(0,3), ['due','again','mistake']);
  assert(study.chooseItems(prompts,input,data,{...data.settings,focus:'vocab'}).every(p => p.skill === 'vocab'));
  assert.equal(study.streak(data.days, new Date(2025,0,2)), 0);
  for (const date of [new Date(2025,0,1,12), new Date(2025,0,2,12)]) {
    study.record(data,{contentId:'6',skill:'vocab',drill:'quiz',result:'incorrect',responseMs:1200},date.getTime());
  }
  assert.equal(study.streak(data.days, new Date(2025,0,2)), 2);
  assert.equal(data.events.at(-1).attempt, 2);
  assert.equal(data.events.at(-1).responseMs, 1200);
  assert.throws(() => study.validate({...data,schema:99}), /không hợp lệ/);
});

const smartSnapshot = page => page.evaluate(() => n5SmartStudy.snapshot());
const smartButton = (page,name) => page.getByRole('button',{name,exact:true});
async function setStudySettings(page, duration, focus, {method, mix = [], custom} = {}) {
  const details = page.locator('#smartStudySettings');
  if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
  const form = page.locator('#smartStudySettingsForm');
  await form.locator('select[name="duration"]').selectOption(String(duration));
  if (duration === 'custom') await form.locator('input[name="custom"]').fill(String(custom));
  await form.locator('select[name="focus"]').selectOption(focus);
  for (const skill of mix) await form.locator(`input[value="${skill}"]`).check();
  if (method) await form.locator('select[name="method"]').selectOption(method);
  await smartButton(page,'Lưu thiết lập').click();
  await page.getByText('Đã lưu thiết lập Smart Study').first().waitFor();
  await page.waitForFunction(expected => {
    const data = n5SmartStudy.snapshot();
    return data.settings.focus === expected.focus && data.settings.minutes === expected.minutes;
  }, {focus,minutes:duration === 'custom' ? custom : duration});
}

async function importFixture(page, backup) {
  await go(page,'backup');
  await page.locator('input[onchange="importHubData(event)"]').setInputFiles({
    name:'backup.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))
  });
  await page.getByText('Đã khôi phục dữ liệu học').first().waitFor();
}

test('Smart Study saves settings, resumes offline, grades shared SRS and restores history', {timeout:90_000}, async t => {
  t.after(() => {networkAvailable = true;});
  const {page, context} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  await smartButton(page,'Bắt đầu học 5 phút').waitFor();
  await page.waitForFunction(() => Boolean(n5SmartStudy.snapshot()?.plan));
  let data = await smartSnapshot(page);
  assert.equal(data.settings.minutes,5);
  assert.equal(data.plan.minutes,5);
  assert.equal(data.events.length,0);
  assert.equal(data.days.length,0);

  await smartButton(page,'Kế hoạch & thiết lập').click();
  await setStudySettings(page,15,'mix',{method:'new',mix:['grammar','kanji']});
  data = await smartSnapshot(page);
  assert.equal(data.plan.minutes,15);
  assert.equal(data.settings.method,'new');
  assert(data.plan.items.length > 4 && data.plan.items.every(item => ['grammar','kanji'].includes(item.skill)));
  const beforeReplace = new Set(data.plan.items.map(item => item.id));
  await smartButton(page,'Thay thế').first().click();
  await page.getByText(/Bạn chọn bài này để thay nhiệm vụ cũ/).first().waitFor();
  data = await smartSnapshot(page);
  assert(data.plan.items.some(item => !beforeReplace.has(item.id)));
  await smartButton(page,'Bỏ qua').first().click();
  await page.getByText('Đã bỏ qua',{exact:true}).first().waitFor();
  assert((await smartSnapshot(page)).plan.results.some(result => result?.result === 'skipped'));
  await page.reload();
  await smartButton(page,'Bắt đầu học 15 phút').waitFor();
  await smartButton(page,'Kế hoạch & thiết lập').click();
  await setStudySettings(page,'custom','reading',{custom:12});
  assert.equal((await smartSnapshot(page)).plan.minutes,12);
  assert((await smartSnapshot(page)).plan.items.every(item => item.skill === 'reading'));

  const dueId = await page.evaluate(() => {
    const id = VOCAB_DATA[0].id;
    state.reviewData[id] = {due:'2020-01-01',remembered:true,reps:0,ease:2.5,interval:0};
    state.reviewData[KANJI_DATA[0].id] = {due:'2020-01-01',remembered:false,reps:0,ease:2.5,interval:0};
    saveState();
    return id;
  });
  await setStudySettings(page,5,'vocab',{method:'review'});
  await page.getByText(/mục đến hạn hoặc chưa nhớ ngoài trọng tâm/).waitFor();
  await smartButton(page,'Bắt đầu buổi học').click();
  await smartButton(page,'Lật thẻ').click();
  await smartButton(page,'Đã nhớ').waitFor();
  const first = (await smartSnapshot(page)).plan;
  assert.equal(first.items[first.index].contentId,dueId);
  assert.equal(first.items[first.index].reason,'due');
  assert.equal(first.revealed,true);

  networkAvailable = false;
  assert.equal((await page.reload()).status(),200);
  await smartButton(page,'Tiếp tục buổi học').click();
  await smartButton(page,'Đã nhớ').waitFor();
  data = await smartSnapshot(page);
  assert.equal(data.plan.id,first.id);
  assert.equal(data.plan.index,first.index);
  assert.equal(data.plan.revealed,true);
  assert.equal(data.events.length,0);

  await smartButton(page,'Đã nhớ').click();
  await page.getByText('Đã ghi nhận là đã nhớ',{exact:true}).waitFor();
  assert.equal(await page.evaluate(id => state.reviewData[id].reps,dueId),1);
  assert.equal((await smartSnapshot(page)).events[0].result,'remembered');
  await page.reload();
  await smartButton(page,'Tiếp tục buổi học').click();
  await page.getByText('Đã ghi nhận là đã nhớ',{exact:true}).waitFor();
  assert.equal((await smartSnapshot(page)).events.length,1);
  data = await smartSnapshot(page);
  for (let index = 1; index < data.plan.items.length; index++) {
    await smartButton(page,'Câu tiếp theo').click();
    await smartButton(page,'Lật thẻ').click();
    await smartButton(page,'Chưa nhớ').click();
    await page.getByText('Đã ghi nhận là cần ôn lại',{exact:true}).waitFor();
  }
  await smartButton(page,'Hoàn tất buổi học').click();
  await page.getByRole('heading',{name:'Tóm tắt buổi học'}).waitFor();
  data = await smartSnapshot(page);
  assert.equal(data.days.length,1);
  assert.equal(data.history.length,1);
  assert.equal(data.history[0].items.length,data.plan.items.length);
  assert(data.history[0].ms >= 0);
  assert(await page.getByText('Cần ôn thêm',{exact:true}).isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  const backup = await page.evaluate(() => n5BackupPayload());
  assert.equal(backup.version,'N5Hub-' + release);
  assert.equal(backup.smartStudy.history.length,1);
  await page.getByText('Lịch sử & dữ liệu học tập',{exact:true}).click();
  await smartButton(page,'Xóa lịch sử phân tích').click();
  await page.waitForFunction(() => n5SmartStudy.snapshot().history.length === 0);
  assert.equal((await smartSnapshot(page)).events.length,0);
  assert.equal(await page.evaluate(id => state.reviewData[id].reps,dueId),1);
  const legacy = {...backup, version:'N5Hub-5.47.1'};
  delete legacy.smartStudy;
  await importFixture(page,legacy);
  assert.equal((await smartSnapshot(page)).history.length,0);
  await importFixture(page,backup);
  assert.equal((await smartSnapshot(page)).history[0].id,backup.smartStudy.history[0].id);

  networkAvailable = true;
  const desktop = await browser.newContext({viewport:{width:1280,height:800}});
  t.after(() => desktop.close());
  const d = await desktop.newPage();
  await d.goto(site);
  await smartButton(d,'Bắt đầu học 5 phút').waitFor();
  const bounds = await d.locator('#smartStudyHome').boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1280);
});

test('Smart Study refuses a stale answer from another tab', {timeout:90_000}, async t => {
  const {page,context} = await openApp(t);
  await smartButton(page,'Bắt đầu học 5 phút').click();
  await smartButton(page,'Lật thẻ').click();
  await smartButton(page,'Đã nhớ').waitFor();

  const other = await context.newPage();
  await other.goto(site);
  await smartButton(other,'Tiếp tục buổi học').click();
  await smartButton(other,'Đã nhớ').waitFor();
  await Promise.allSettled([smartButton(page,'Đã nhớ').click({timeout:3000}), smartButton(other,'Đã nhớ').click({timeout:3000})]);
  await page.waitForFunction(() => n5SmartStudy.snapshot()?.events.length === 1);
  const after = await smartSnapshot(page);
  assert.equal(after.events.length,1);
  assert.equal(after.plan.results.filter(Boolean).length,1);
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('n5_hub_review'))[id].reps,after.plan.items[0].contentId),1);
});

test('Cloud Sync keeps Smart Study when older cloud data arrives and pauses on a different active plan', {timeout:90_000}, async t => {
  const {page} = await openApp(t);
  await smartButton(page,'Bắt đầu học 5 phút').click();
  await smartButton(page,'Lật thẻ').click();
  await smartButton(page,'Đã nhớ').waitFor();
  const db = cloudFixture(t);
  const original = (await smartSnapshot(page)).plan.id;
  await cloudLogin(page,db.user);
  const status = page.locator('#n5-cloud-status');
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(db.row.data.smartStudy.plan.id, original);
  await page.evaluate(() => n5CloudToggleAuto(true));
  await status.getByText(/Dữ liệu đã đồng nhất/).waitFor();

  const vocabId = await page.evaluate(() => VOCAB_DATA[1].id);
  const legacy = {...db.row.data,version:'N5Hub-5.47.1',bookmarks:[vocabId]};
  delete legacy.smartStudy;
  db.row = {...db.row,revision:2,data:legacy};
  await page.evaluate(() => n5CloudSync('auto'));
  await status.getByText(/Đã nhận dữ liệu mới/).waitFor();
  assert.equal((await smartSnapshot(page)).plan.id,original);
  assert.deepEqual(await page.evaluate(() => state.bookmarks),[vocabId]);
  await page.evaluate(() => n5CloudSync('auto'));
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(db.row.revision,3);
  assert.equal(db.row.data.smartStudy.plan.id,original);

  db.row = {...db.row,revision:4,data:{...db.row.data,smartStudy:{...db.row.data.smartStudy,plan:null}}};
  await page.evaluate(() => n5CloudSync('auto'));
  await status.getByText(/Có buổi Smart Study đang dở/).waitFor();
  assert.equal((await smartSnapshot(page)).plan.id,original);
  assert.equal(db.row.data.smartStudy.plan,null);
  assert.equal(db.pushes,2);
});

test('Smart Study runs real form, reading, listening and JLPT prompts', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  await smartButton(page,'Kế hoạch & thiết lập').click();
  await setStudySettings(page,5,'form');
  await smartButton(page,'Bắt đầu buổi học').click();
  let plan = (await smartSnapshot(page)).plan;
  assert(plan.items.every(item => item.skill === 'form' && item.drill === 'write'));
  assert.match(plan.items[0].prompt,/Hãy nhập/);
  const form = page.locator('#smartStudyAnswerForm');
  await form.locator('input').fill(plan.items[0].answer);
  await smartButton(page,'Kiểm tra').click();
  await page.getByText('Đúng',{exact:true}).waitFor();
  await smartButton(page,'Câu tiếp theo').click();
  await form.locator('input').fill('n5-test-sai');
  await smartButton(page,'Kiểm tra').click();
  await page.getByText('Chưa đúng',{exact:true}).waitFor();
  const incorrect = (await smartSnapshot(page)).events.at(-1);
  assert.equal(incorrect.skill,'form');
  assert.equal(incorrect.result,'incorrect');
  assert(incorrect.form && Number.isInteger(incorrect.responseMs));
  assert(await page.evaluate(id => state.mistakes.some(item => item.contentId === id), incorrect.contentId));

  await smartButton(page,'Tạm dừng').click();
  await setStudySettings(page,5,'reading');
  assert.equal((await smartSnapshot(page)).plan.id,plan.id);
  assert.equal((await smartSnapshot(page)).plan.index,1);
  await smartButton(page,'Tạo lại kế hoạch').click();
  await page.waitForFunction(() => n5SmartStudy.snapshot().plan.settings.focus === 'reading');
  await smartButton(page,'Bắt đầu buổi học').click();
  plan = (await smartSnapshot(page)).plan;
  assert(plan.items.every(item => item.skill === 'reading' && item.drill === 'choice'));
  assert.match(plan.items[0].prompt,/\n\n/);
  await smartButton(page,plan.items[0].answer).click();
  await page.getByText('Đúng',{exact:true}).waitFor();

  await smartButton(page,'Tạm dừng').click();
  await setStudySettings(page,5,'listening');
  await smartButton(page,'Tạo lại kế hoạch').click();
  await page.waitForFunction(() => n5SmartStudy.snapshot().plan.settings.focus === 'listening');
  await smartButton(page,'Bắt đầu buổi học').click();
  plan = (await smartSnapshot(page)).plan;
  const question = page.locator('#smartStudyQuestion');
  await smartButton(page,'Nghe đoạn tiếng Nhật').waitFor();
  assert(!(await question.innerText()).includes(plan.items[0].audio));
  await smartButton(page,plan.items[0].answer).click();
  await page.getByText('Đúng',{exact:true}).waitFor();
  await question.getByText('Xem lời thoại',{exact:true}).waitFor();

  await smartButton(page,'Tạm dừng').click();
  await setStudySettings(page,60,'jlpt');
  await smartButton(page,'Tạo lại kế hoạch').click();
  await page.waitForFunction(() => n5SmartStudy.snapshot().plan.settings.focus === 'jlpt');
  plan = (await smartSnapshot(page)).plan;
  assert(plan.items.length > 20 && plan.items.every(item => item.skill === 'jlpt' && item.drill === 'choice'));
  assert(plan.items.some(item => item.title.startsWith('Từ vựng')));
  assert(plan.items.some(item => item.title.startsWith('Ngữ pháp')));
});
