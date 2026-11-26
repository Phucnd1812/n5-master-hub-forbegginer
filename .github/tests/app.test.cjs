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
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png','.woff2':'font/woff2',
  '.webmanifest':'application/manifest+json', '.json':'application/json', '.bin':'application/octet-stream'};
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

async function openApp(t, contextOptions, initScript) {
  const context = await browser.newContext(contextOptions);
  t.after(() => context.close());
  if (initScript) await context.addInitScript(initScript);
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
  for (const directory of ['assets/search','assets/grammar','assets/learning','assets/ui','assets/data']) {
    for (const asset of fs.readdirSync(path.join(root,directory))) assert(worker.includes(directory + '/' + asset),asset);
  }
  new vm.Script(worker);
  new vm.Script(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'));
  for (const script of index.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
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
  await page.locator('#n5InstantLookup:not([hidden])').waitFor();
  assert.equal(await page.evaluate(()=>state.globalSearchActive),false);
  await search.press('Enter');
  await page.waitForFunction(() => document.getElementById('mainContainer').dataset.n5Page === 'global-search');
  await page.locator('[data-lookup-query="食べませんでした"]').waitFor();
  assert.equal(await page.locator('#mainContainer h1').textContent(), 'Kết quả cho “食べませんでした”');
  assert(await page.locator('[data-lookup-analysis]').getByText('食べる → 食べ → 食べませんでした').isVisible());

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

async function lookup(page, query) {
  const input = page.locator('#globalSearchInput');
  await input.fill(query);
  await input.press('Enter');
  await page.locator('[data-lookup-state="ready"]').waitFor();
  assert.equal(await page.locator('[data-lookup-state="ready"]').getAttribute('data-lookup-query'),query);
}

test('Universal Search connects sentence, dictionary, grammar, Kanji, review and history', {timeout: 90_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  const workers = [];
  page.on('worker', worker => workers.push(worker.url()));
  await lookup(page,'飲まなければならない');
  assert(workers.some(url => url.includes('/assets/search/search-worker.js?v=' + release)));
  const main = page.locator('#mainContainer');
  const summary = main.locator('.n5-lookup-form');
  assert(await summary.getByText('飲む → 飲まない → 飲まなければ → 飲まなければならない', {exact:true}).isVisible());
  await main.locator('[data-result-id="v6c_028"] button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Cách đọc', {exact:true}).waitFor();
  assert.equal(await main.getAttribute('data-n5-page'),'global-search');
  const box = await dialog.boundingBox();
  const {width,height} = page.viewportSize();
  assert(box.width <= width + 1 && box.y + box.height >= height - 3,JSON.stringify(box));
  assert(await dialog.getByText(/Động từ nhóm I \(godan\)/).isVisible());
  assert(await dialog.locator('.n5-lookup-steps li').count() >= 3);

  const oldSchedule = await page.evaluate(() => {
    const id = 'v6c_028';
    saveFlashcardKnowledge(id,true);
    return {...state.reviewData[id]};
  });
  await dialog.getByRole('button',{name:'Thêm vào danh sách ôn'}).click();
  await dialog.getByRole('button',{name:'Đã có trong danh sách ôn'}).waitFor();
  const review = await page.evaluate(() => ({
    schedule:state.reviewData.v6c_028, learned:state.completedItems.includes('v6c_028'),
    due:getSrsQueueData().due.some(item => item.id === 'v6c_028')
  }));
  assert.equal(review.schedule.interval,oldSchedule.interval);
  assert.equal(review.schedule.reps,oldSchedule.reps);
  assert.equal(review.schedule.last,oldSchedule.last);
  assert(review.learned && review.due);
  await dialog.getByRole('button',{name:'～なければならない',exact:true}).click();
  await dialog.getByRole('heading',{name:'Hình thành từng bước'}).waitFor();
  await dialog.getByRole('button',{name:'行かなければならない',exact:true}).click();
  assert.match(await dialog.getByRole('status').textContent(),/^Đúng/);
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await dialog.getByRole('button',{name:'飲',exact:true}).click();
  await dialog.getByText('Âm On',{exact:true}).waitFor();
  assert(await dialog.getByRole('button',{name:'Cách viết và thứ tự nét'}).isVisible());
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await dialog.getByRole('button',{name:'Thêm Flashcard cá nhân'}).click();
  const personal = page.locator('#n5PersonalModal');
  await personal.locator('textarea[name="jp"]').waitFor();
  assert.equal(await personal.locator('textarea[name="jp"]').inputValue(),'飲む');
  assert.match(await personal.locator('[name="vi"]').inputValue(),/uống/);
  await personal.locator('button[type="submit"]').click();
  assert(await page.evaluate(() => state.personalCards.cards.some(card => card.jp === '飲む')));

  const sentence = '昨日、友達と映画を見てから、ご飯を食べました。';
  await lookup(page,sentence);
  await main.getByRole('button',{name:'Phân tích câu',exact:true}).click();
  await main.getByRole('tab',{name:'Phân tích chi tiết',exact:true}).click();
  assert(await main.getByText(/Chỉ người cùng thực hiện/).isVisible());
  await main.locator('[data-translation-result]').getByText(/sau khi xem phim với bạn/).waitFor();
  assert(await main.locator('ruby').count() > 0);
  await main.getByRole('button',{name:'Furigana',exact:true}).click();
  await main.getByRole('button',{name:'Romaji',exact:true}).click();
  assert.equal(await main.locator('ruby').count(),0);
  await main.getByRole('button',{name:'Lưu tra cứu',exact:true}).click();
  assert(await page.evaluate(query => n5BackupPayload().searchHistory.includes(query),sentence));

  await page.locator('#globalSearchClearBtn').click();
  const recent = page.locator('#n5LookupRecent');
  await recent.getByRole('button',{name:sentence,exact:true}).click();
  await main.locator('[data-lookup-state="ready"]').waitFor();
  assert.equal(await main.getByRole('button',{name:'Romaji',exact:true}).getAttribute('aria-pressed'),'false');

  const desktop = await browser.newContext({viewport:{width:1280,height:800}});
  t.after(() => desktop.close());
  await desktop.route('**/*',route => route.request().url().startsWith(site) ? route.continue() : route.abort());
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(site,{waitUntil:'domcontentloaded'});
  await lookup(desktopPage,'na');
  const known = desktopPage.locator('[data-result-type="vocab"][data-result-id^="v"]').first();
  const knownId = await known.getAttribute('data-result-id');
  await known.locator('button').click();
  await desktopPage.getByRole('dialog').getByRole('button',{name:'Mở trong giáo trình'}).click();
  await desktopPage.locator('#search-item-' + knownId).waitFor();
  await desktopPage.locator('#backHeaderBtn').click();
  await desktopPage.locator('[data-lookup-state="ready"]').waitFor();
  assert.equal(await desktopPage.locator('#globalSearchInput').inputValue(),'na');
  await known.locator('button').click();
  await desktopPage.keyboard.press('Escape');
  await desktopPage.getByRole('dialog').waitFor({state:'hidden'});
  await desktopPage.waitForFunction(id =>
    document.activeElement === document.querySelector('[data-result-id="' + id + '"] button'),knownId);

  networkAvailable = false;
  t.after(() => { networkAvailable = true; });
  assert.equal((await page.reload()).status(),200);
  await lookup(page,'nondekara');
  const offline = page.locator('[data-lookup-analysis]');
  assert(await offline.getByText(/飲む → 飲んで → 飲んでから/).isVisible());
  await offline.getByRole('button',{name:'～てから',exact:true}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Ví dụ và phân tích'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
  await page.locator('#handwritingSearchToggle').click();
  await page.evaluate(async () => {
    const strokes = await n5OfflineKanjiStrokes('一');
    handwritingStrokes = [handwritingPathToPoints(strokes[0])];
  });
  await page.locator('#recognizeHandwritingBtn').click();
  await page.locator('#handwritingSearchResults .handwriting-candidate').filter({hasText:'一'}).first().click();
  await page.locator('[data-result-type="kanji"]').first().waitFor();
  assert.equal(await page.locator('#globalSearchInput').inputValue(),'一');
});

test('deep grammar builds forms, compares usage, saves a closed error and opens offline examples', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  await lookup(page,'phải làm');
  await page.locator('[data-result-id="obligation"] button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'～なければならない',exact:true}).waitFor();
  const romaji = dialog.getByRole('button',{name:'Romaji',exact:true});
  const firstReading = dialog.locator('[data-grammar-reading="roman"]').first();
  await firstReading.waitFor();
  await romaji.click();
  await firstReading.waitFor({state:'hidden'});
  await romaji.click();
  await firstReading.waitFor();
  const visual = dialog.locator('[data-grammar-visualizer]');
  await visual.getByRole('button',{name:'Xem ví dụ với 飲む'}).click();
  await visual.getByText('飲む → 飲まない → 飲まなければ → 飲まなければならない',{exact:true}).waitFor();
  await visual.locator('input').fill('taberu');
  await visual.getByRole('button',{name:'Xem từng bước'}).click();
  await visual.getByText(/食べる → 食べない → 食べなければ → 食べなければならない/).waitFor();
  await visual.locator('input').fill('車');
  await visual.getByRole('button',{name:'Xem từng bước'}).click();
  await visual.getByText(/Chưa xác định/).waitFor();

  const exercise = dialog.locator('[data-closed-id="obligation"]');
  await exercise.getByRole('button',{name:'行ってはいけない',exact:true}).click();
  await page.waitForFunction(() => state.mistakes.some(item => item.id === 'obligation' && item.source === 'grammar-review'));
  assert.match(await exercise.getByRole('status').textContent(),/^Chưa đúng/);
  assert(await exercise.getByText('行かなくてもいい cho phép không đi.',{exact:false}).isVisible());
  const writing = dialog.getByRole('textbox',{name:'Đặt một câu tiếng Nhật dùng mẫu trong một tình huống của bạn.'});
  await writing.fill('駅に行かなければならない。');
  const practice = dialog.locator('[data-section="practice"]');
  await practice.getByText('Xem đáp án tham khảo',{exact:true}).last().click();
  assert.equal(await page.evaluate(() => state.mistakes.length),1);
  await dialog.getByRole('button',{name:'～なければならない và ～なくてもいい',exact:true}).click();
  await dialog.getByRole('heading',{name:'Luyện phân biệt'}).waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  assert.equal(await writing.inputValue(),'駅に行かなければならない。');

  await dialog.getByRole('button',{name:'Thu gọn tất cả'}).click();
  assert.equal(await dialog.locator('details[data-section][open]').count(),0);
  await dialog.getByRole('button',{name:'Mở rộng tất cả'}).click();
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await go(page,'mistakes');
  await dialog.waitFor({state:'hidden'});
  assert(await page.locator('#mainContainer').getByText(/Chọn cách nói “phải đi”/).isVisible());

  networkAvailable = false;
  t.after(() => { networkAvailable = true; });
  await page.reload();
  await go(page,'grammar');
  await page.getByRole('button',{name:'Kho câu ví dụ',exact:true}).click();
  await dialog.getByRole('combobox').selectOption('g12a_2');
  await dialog.getByRole('button',{name:'Tra từ và Kanji trong câu'}).first().click();
  await dialog.locator('.n5-grammar-tokens [data-lookup="grammar-word"]').first().click();
  await dialog.getByRole('button',{name:'Nghe phát âm'}).waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await dialog.getByRole('button',{name:'Xác định việc làm trước bằng ～てから',exact:true}).click();
  await dialog.getByRole('heading',{name:'Hình thành từng bước'}).waitFor();
  const sorting = dialog.locator('[data-grammar-sort]');
  for (const part of ['水を','飲んでから、','薬を','飲みます。']) await sorting.getByRole('button',{name:part,exact:true}).click();
  await sorting.getByRole('button',{name:'Đối chiếu thứ tự'}).click();
  assert.match(await sorting.getByRole('status').textContent(),/^Đúng/);
});

test('contextual lookup supports IME and preserves a grammar exercise on return', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  await lookup(page,'薬を飲んでから寝なければなりません。');
  const analysis = page.locator('[data-lookup-analysis]');
  assert(await analysis.locator('.n5-lookup-phrases').getByText('Tân ngữ',{exact:true}).isVisible());
  await analysis.getByText('Sau khi uống thuốc, phải đi ngủ.',{exact:true}).waitFor();
  await analysis.getByRole('tab',{name:'Ngữ pháp',exact:true}).click();
  await analysis.locator('[data-lookup="grammar"][data-value="obligation"]').click();
  const dialog = page.getByRole('dialog');
  const answer = dialog.locator('textarea[lang="vi"]');
  await answer.fill('Bài dịch đang làm.');
  const detail = dialog.locator('.n5-lookup-detail');
  const savedScroll = await detail.evaluate(el => {
    el.scrollTop = Math.min(620,el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  const dialogInput = dialog.getByRole('searchbox');
  const searchForm = dialog.locator('[data-dialog-search]');
  await dialogInput.dispatchEvent('compositionstart');
  await dialogInput.fill('跨');
  await searchForm.dispatchEvent('submit');
  assert.equal(await answer.inputValue(),'Bài dịch đang làm.');
  await dialogInput.fill('跨がせられませんでした');
  await dialogInput.dispatchEvent('compositionend');
  await dialogInput.press('Enter');
  const result = dialog.locator('[data-result-id^="jmdict:1267830:"]');
  await result.locator('button').click();
  await dialog.getByRole('link',{name:'Giấy phép JMdict · CC BY-SA 4.0'}).waitFor();
  assert(await dialog.locator('.n5-lookup-steps').getByText('跨がせられませんでした',{exact:false}).count() > 0);
  await dialog.getByRole('button',{name:'Xem các dạng chia'}).click();
  await dialog.getByRole('button',{name:/跨いで · Thể て/}).click();
  await dialog.locator('.n5-lookup-path').getByText('跨ぐ → 跨いで',{exact:true}).waitFor();
  const back = dialog.getByRole('button',{name:'Quay lại',exact:true});
  await back.click();
  await back.click();
  await back.click();
  assert.equal(await dialogInput.inputValue(),'薬を飲んでから寝なければなりません。');
  assert.equal(await answer.inputValue(),'Bài dịch đang làm.');
  assert(Math.abs((await detail.evaluate(el => el.scrollTop)) - savedScroll) <= 2);
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  assert.equal(await page.locator('#globalSearchInput').inputValue(),'薬を飲んでから寝なければなりません。');
  assert.equal(await analysis.getByRole('tab',{name:'Ngữ pháp',exact:true}).getAttribute('aria-selected'),'true');
  await analysis.getByRole('tab',{name:'Tổng hợp',exact:true}).click();
  await analysis.locator('.n5-lookup-phrases [data-lookup="part"]').filter({hasText:'飲んでから'}).first().click();
  await dialog.getByRole('button',{name:'飲',exact:true}).click();
  await dialog.getByText(/Thứ tự nét ·/).click();
  assert(await dialog.locator('svg.n5-lookup-strokes path').count() > 0);
});

test('Tổng quan is a standalone active button on desktop and mobile', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  const sidebarHome = page.locator('#sidebar nav > [data-nav="dashboard"]');
  assert.equal(await sidebarHome.innerText(),'Tổng quan');
  assert.equal(await sidebarHome.getAttribute('aria-current'),'page');
  assert.equal(await sidebarHome.getAttribute('aria-expanded'),null);
  assert.equal(await sidebarHome.locator('svg.lucide-house').count(),1);
  assert.equal(await page.locator('#sidebar nav details summary').count(),4);
  await go(page,'analytics');
  assert.equal(await sidebarHome.getAttribute('aria-current'),null);
  await sidebarHome.click();
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await page.locator('#desktopSidebarToggleBtn').click();
  assert(await page.locator('body').evaluate(body => body.classList.contains('sidebar-collapsed')));
  await page.locator('#desktopSidebarToggleBtn').click();
  await page.setViewportSize({width:390,height:844});
  const bottomHome = page.locator('[data-mobile-tab="home"]');
  assert.equal(await bottomHome.getAttribute('aria-current'),'page');
  await page.locator('[data-mobile-tab="learn"]').click();
  assert(await page.locator('#sidebar details[data-nav-group="learn"]').evaluate(group => group.open));
  await page.locator('#sidebar [data-nav="grammar"]').click();
  assert.equal(await bottomHome.getAttribute('aria-current'),null);
  await bottomHome.click();
  assert.equal(await bottomHome.getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
});

test('new lookup returns to the top and a verb immediately shows its conjugations', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13']});
  await go(page,'vocab');
  await page.evaluate(() => window.scrollTo({top:600,behavior:'instant'}));
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => n5SmartSearch('飲む'));
  await page.locator('[data-lookup-state="ready"]').waitFor();
  assert.equal(await page.evaluate(() => window.scrollY),0);
  assert.equal(await page.locator('#mainContainer').evaluate(element => element.scrollTop),0);
  await page.locator('[data-result-id="v6c_028"] button').click();
  const dialog = page.getByRole('dialog');
  const forms = dialog.locator('[data-verb-conjugations]');
  await forms.getByRole('button',{name:'飲みます',exact:true}).waitFor();
  await forms.getByRole('button',{name:'飲んで',exact:true}).click();
  await dialog.locator('.n5-lookup-path').getByText('飲む → 飲んで',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await forms.getByRole('button',{name:'飲まない',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();

  await go(page,'vocab');
  await page.evaluate(() => window.scrollTo({top:600,behavior:'instant'}));
  const input = page.locator('#globalSearchInput');
  await input.fill('飲む');
  await page.locator('#n5InstantLookup:not([hidden])').waitFor();
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'vocab');
  await input.press('Enter');
  await page.waitForFunction(() => window.scrollY===0);
});

async function openPracticeTool(page, view) {
  const more = page.locator('[data-mobile-tab="more"]');
  if (await more.isVisible()) await more.click();
  const group = page.locator('#sidebar details[data-nav-group="practice"]');
  if (!await group.evaluate(element => element.open)) await group.locator('summary').click();
  await group.locator('[data-nav="' + view + '"]').click();
  return page.getByRole('dialog');
}

test('Sentence Builder accepts alternate answers and keeps open answers for self-comparison', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  const dialog = await openPracticeTool(page,'sentenceBuilder');
  const builder = dialog.locator('[data-sentence-builder]');
  const filter = builder.locator('[data-builder-filter="kind"]');
  await filter.selectOption('particle');
  const existence = builder.locator('[data-exercise="particle-existence"]');
  await existence.getByRole('radio',{name:'で',exact:true}).check();
  await existence.getByRole('button',{name:'Kiểm tra',exact:true}).click();
  await existence.locator('[data-builder-feedback][data-result="mismatch"]').waitFor();
  await existence.locator('[data-builder-action="save"]').click();
  await page.waitForFunction(() => state.mistakes.some(row => row.source === 'sentence-builder'));
  await builder.getByRole('button',{name:'Bài tiếp',exact:true}).click();
  const directions = builder.locator('[data-exercise="particle-station"]');
  await directions.getByRole('radio',{name:'へ',exact:true}).check();
  await directions.getByRole('button',{name:'Kiểm tra',exact:true}).click();
  await directions.locator('[data-builder-feedback][data-result="alternate"]').waitFor();
  assert.equal(await directions.locator('[data-builder-action="save"]').isVisible(),false);

  await filter.selectOption('translate');
  const translation = builder.locator('[data-exercise="translate-student"]');
  const answer = translation.locator('[name="builder-answer"]');
  await answer.fill('学生です。');
  await translation.getByRole('button',{name:'Đối chiếu câu',exact:true}).click();
  await translation.locator('[data-builder-feedback][data-result="alternate"]').waitFor();
  await answer.fill('自分は大学生です。');
  await translation.getByRole('button',{name:'Đối chiếu câu',exact:true}).click();
  await translation.locator('[data-builder-feedback][data-result="review"]').waitFor();
  assert.equal(await translation.locator('[data-builder-action="save"]').isVisible(),false);

  await translation.locator('[data-builder-action="grammar"]').first().click();
  await dialog.locator('.n5-grammar-chapter').waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  assert.equal(await answer.inputValue(),'自分は大学生です。');
  assert.equal(await filter.inputValue(),'translate');
  assert.equal(await translation.locator('[data-builder-feedback]').getAttribute('data-result'),'review');
});

test('Grammar Checker separates rule errors from uncertainty and reopens the saved practice', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  const dialog = await openPracticeTool(page,'grammarChecker');
  const checker = dialog.locator('[data-n5-checker]');
  const input = checker.locator('textarea[name="sentence"]');
  const check = async (sentence, status) => {
    await input.fill(sentence);
    await checker.locator('form button[type="submit"]').click();
    await checker.locator('[data-checker-status="' + status + '"]').waitFor();
  };
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await check('毎日、日本語を勉強します。','clean');
  assert.equal(await checker.locator('[data-checker-save]').count(),0);
  await check('学校で行きます。','uncertain');
  assert.equal(await checker.locator('[data-checker-save]').count(),0);
  await check('毎日、日本語を勉強するます。','error');
  const issue = checker.locator('mark[data-n5-issue]');
  assert.match(await issue.first().textContent(),/するます/);
  await checker.getByText('毎日、日本語を勉強します。',{exact:true}).waitFor();

  await checker.locator('[data-checker-save]').first().click();
  await page.waitForFunction(() => state.mistakes.some(row => row.source === 'grammar-checker'));
  await checker.locator('[data-checker-practice]').first().click();
  await dialog.locator('[data-sentence-builder] .n5-builder-card').waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  assert.equal(await input.inputValue(),'毎日、日本語を勉強するます。');
  await checker.locator('[data-checker-status="error"]').waitFor();

  await input.focus();
  await page.setViewportSize({width:390,height:475});
  await page.waitForFunction(() => {
    const rect = document.querySelector('.n5-lookup-dialog').getBoundingClientRect();
    return rect.width <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  });
  await input.scrollIntoViewIfNeeded();
  const inputArea = await input.boundingBox();
  assert(inputArea.y >= 0 && inputArea.y + inputArea.height <= 475);
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await go(page,'mistakes');
  await page.getByRole('button',{name:'Luyện cấu trúc',exact:true}).click();
  await dialog.locator('[data-sentence-builder] .n5-builder-card').waitFor();
});

test('Spotlight keyboard navigation opens the knowledge map and a contextual conjugation', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  await page.keyboard.press('Control+k');
  const palette=page.getByRole('dialog',{name:'Tra cứu và đi nhanh'});
  await palette.getByRole('searchbox').waitFor();
  await palette.getByRole('searchbox').press('ArrowDown');
  await page.waitForFunction(()=>document.activeElement?.dataset.value==='translator');
  await page.keyboard.press('Escape');
  await palette.waitFor({state:'hidden'});
  await lookup(page,'飲む');
  await page.locator('#globalSearchInput').press('ArrowDown');
  await page.waitForFunction(() => document.activeElement?.matches('[data-result-id] button.n5-lookup-title'));
  await page.locator('[data-result-id="v6c_028"] button.n5-lookup-title').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[data-lookup="word-knowledge"]').click();
  const knowledge = dialog.locator('[data-knowledge-word="飲む"]');
  await knowledge.getByRole('button',{name:'飲んで',exact:true}).waitFor();
  await knowledge.getByRole('button',{name:'飲まない',exact:true}).waitFor();
  await knowledge.getByRole('button',{name:'飲',exact:true}).click();
  await dialog.getByText('Âm On',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await knowledge.locator('[data-lookup="word-drill"]').click();
  const builder = dialog.locator('[data-sentence-builder]');
  await builder.locator('[data-builder-filter="form"]').selectOption('te');
  const drill = builder.locator('[data-exercise="lemma-te"]');
  await drill.locator('[name="builder-answer"]').fill('のんで');
  await drill.getByRole('button',{name:'Kiểm tra',exact:true}).click();
  await drill.locator('[data-builder-feedback]:is([data-result="match"],[data-result="alternate"])').waitFor();
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await knowledge.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('#globalSearchInput').inputValue(),'飲む');
});

test('effect settings, light and dark surfaces, desktop tilt and Flashcard faces', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800},colorScheme:'light',reducedMotion:'no-preference'});
  const settings = page.locator('#n5-effects-select');
  const html = page.locator('html');
  assert.equal(await settings.inputValue(),'auto');
  assert.equal(await html.getAttribute('data-n5-effect-mode'),'auto');
  assert.equal(await page.evaluate(() => Object.hasOwn(n5BackupPayload(),'uiEffects')),false);
  for (const mode of ['full','balanced','performance','auto']) {
    await settings.selectOption(mode);
    assert.equal(await html.getAttribute('data-n5-effect-mode'),mode);
    if (mode !== 'auto') assert.equal(await html.getAttribute('data-n5-effects'),mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('n5_effects_mode_v1')),mode);
  }
  await settings.selectOption('full');
  const card = page.locator('.dashboard-feature-card[data-n5-tilt]').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover({position:{x:40,y:35}});
  await card.and(page.locator('[data-n5-tilting]')).waitFor();
  assert.match(await card.evaluate(el => el.style.getPropertyValue('--n5-tilt')),/deg$/);
  await page.mouse.move(4,4);
  await page.waitForFunction(() => !document.querySelector('[data-n5-tilting]'));
  assert.equal(await card.evaluate(el => el.style.getPropertyValue('--n5-tilt')),'');

  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.waitForFunction(() => document.documentElement.classList.contains('dark') &&
    document.documentElement.dataset.n5Effects === 'performance');
  assert.equal(await settings.inputValue(),'full');
  await go(page,'flashcard');
  const flashcard = page.locator('#flashcardElement');
  const faces = await flashcard.locator('.flashcard-face').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return [style.backfaceVisibility || style.webkitBackfaceVisibility,style.pointerEvents];
  }));
  assert.deepEqual(faces,[['hidden','auto'],['hidden','none']]);
  await flashcard.click();
  await page.waitForFunction(() => document.querySelector('#flashcardElement').classList.contains('rotate-y-180'));
  assert.deepEqual(await flashcard.locator('.flashcard-face').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).pointerEvents)),['none','auto']);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

test('touch layout preserves full depth without pointer tilt or horizontal overflow', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'light',reducedMotion:'no-preference'});
  await page.locator('[data-mobile-tab="more"]').tap();
  await page.locator('#n5-effects-select').selectOption('full');
  await page.locator('#sidebarOverlay').tap({position:{x:page.viewportSize().width - 8,y:100}});
  await page.waitForFunction(() => document.documentElement.dataset.n5Effects === 'full');
  const stat = page.locator('.dashboard-stat-card[data-n5-tilt]').first();
  await stat.tap();
  await stat.dispatchEvent('pointermove',{pointerType:'touch',clientX:12,clientY:34,bubbles:true});
  assert.equal(await page.locator('[data-n5-tilting]').count(),0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'),/viewport-fit=cover/);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-n5-effect-mode'),'full');
});

test('new comparison headings and verified dictionary links work offline', {timeout:60_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13']});
  networkAvailable = false;
  t.after(() => { networkAvailable = true; });
  await page.goto(site,{waitUntil:'domcontentloaded'});
  await lookup(page,'chậm nhất vào thứ Sáu');
  await page.locator('[data-result-id="compare:deadline"] button').click();
  const dialog = page.getByRole('dialog');
  const table = dialog.getByRole('table');
  await table.getByRole('rowheader',{name:'までに',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Phân tích câu',exact:true}).last().click();
  await dialog.locator('[data-lookup-analysis]').getByText('Hạn cuối',{exact:true}).waitFor();
  await dialog.getByRole('searchbox').fill('申込みました');
  await dialog.getByRole('searchbox').press('Enter');
  await dialog.locator('[data-result-id^="jmdict:1362890:"] button').click();
  await dialog.getByText('Cách viết khác',{exact:true}).waitFor();
});

test('dictionary imports join Universal Search and remain available after offline reload', {timeout:60_000}, async t => {
  const {page} = await openApp(t);
  await go(page,'backup');
  await page.locator('#n5-dictionary-packs input[type=file]').setInputFiles({
    name:'test-dictionary.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify([{jp:'宇宙猫',kana:'うちゅうねこ',vi:'mèo không gian kiểm thử',pos:'Danh từ'}])),
  });
  await page.getByText(/test-dictionary.json/).waitFor();
  await lookup(page,'meo khong gian kiem thu');
  await page.locator('[data-result-type="vocab"]').filter({hasText:'宇宙猫'}).locator('button').click();
  await page.getByRole('dialog').getByText('Tệp từ điển của bạn',{exact:false}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
  networkAvailable = false;
  t.after(() => { networkAvailable = true; });
  await page.reload();
  await lookup(page,'uchuuneko');
  assert(await page.locator('[data-result-type="vocab"]').filter({hasText:'宇宙猫'}).isVisible());
});

test('Universal Search falls back when a browser cannot create module workers', {timeout:45_000}, async t => {
  const {page} = await openApp(t,{},() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        if (options?.type === 'module') throw new Error('module workers disabled for this browser test');
        super(url,options);
      }
    };
  });
  await lookup(page,'tabesasenai');
  assert(await page.locator('[data-lookup-analysis]').getByText(/食べる → 食べさせる → 食べさせない/).isVisible());
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

test('effect preferences round-trip through backup and mock cloud and survive older snapshots', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  await page.waitForFunction(() => Boolean(n5SmartStudy.snapshot()?.plan));
  const settings = page.locator('#n5-effects-select');
  const prepare = await page.evaluate(() => {
    toggleBookmark(VOCAB_DATA[0].id);
    return VOCAB_DATA.slice(0,3).map(item => item.id);
  });
  await settings.selectOption('balanced');
  const backup = await page.evaluate(() => n5BackupPayload());
  assert.equal(backup.uiEffects,'balanced');
  assert(backup.bookmarks.includes(prepare[0]));
  const legacy = {...backup,version:'N5Hub-5.51'};
  delete legacy.uiEffects;
  await settings.selectOption('full');
  await importFixture(page,legacy);
  assert.equal(await settings.inputValue(),'full');
  await importFixture(page,backup);
  await page.waitForFunction(() => document.querySelector('#n5-effects-select').value === 'balanced');
  assert.deepEqual(await page.evaluate(() => state.bookmarks),backup.bookmarks);

  const db = cloudFixture(t);
  await cloudLogin(page,db.user);
  const status = page.locator('#n5-cloud-status');
  await status.getByText(/Đã gửi dữ liệu/).waitFor();
  assert.equal(db.row.data.uiEffects,'balanced');
  db.row = {...db.row,revision:2,data:{...db.row.data,uiEffects:'performance',bookmarks:prepare.slice(0,2)}};
  await page.getByRole('button',{name:'Đồng bộ ngay'}).click();
  await page.waitForFunction(() => document.querySelector('#n5-effects-select').value === 'performance');
  assert.deepEqual(await page.evaluate(() => state.bookmarks),prepare.slice(0,2));

  const legacyCloud = {...db.row.data,version:'N5Hub-5.51',bookmarks:prepare};
  delete legacyCloud.uiEffects;
  db.row = {...db.row,revision:3,data:legacyCloud};
  await page.getByRole('button',{name:'Đồng bộ ngay'}).click();
  await page.waitForFunction(() => state.bookmarks.length === 3);
  assert.equal(await settings.inputValue(),'performance');
  assert.deepEqual(await page.evaluate(() => state.bookmarks),prepare);
  assert.equal(db.pushes,1);
});

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
  const restored = page.getByText('Đã khôi phục dữ liệu học',{exact:true}).first();
  await restored.waitFor({state:'detached'});
  await page.locator('input[onchange="importHubData(event)"]').setInputFiles({
    name:'backup.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))
  });
  await restored.waitFor();
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
  const {page:desktop} = await openApp(t,{viewport:{width:1280,height:800}});
  // The daily plan replaces its home section asynchronously. Resolve the
  // current node and check its geometry in one browser turn.
  await desktop.waitForFunction(() => {
    const bounds = document.getElementById('smartStudyHome')?.getBoundingClientRect();
    return bounds && bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.right <= innerWidth;
  });
  await smartButton(desktop,'Bắt đầu học 5 phút').waitFor();
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

test('hybrid translation preserves local search, memory, and offline history', {timeout:90_000}, async t => {
  const {page,context}=await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  await lookup(page,'テレビを見ています。');
  const inline=page.locator('[data-n5-translation-slot]');
  await inline.getByText('Đang xem TV.',{exact:true}).waitFor();
  await inline.getByText('Dịch tham khảo theo quy tắc',{exact:true}).waitFor();
  await inline.getByRole('button',{name:'Lưu câu',exact:true}).click();
  await inline.getByText('Đã lưu câu.',{exact:true}).waitFor();
  await lookup(page,'thuốc');
  assert.equal(await page.locator('[data-translation-result]').count(),0);
  await go(page,'translator');
  const tool=page.locator('[data-n5-translation-tool]');
  const input=tool.getByRole('textbox',{name:'Văn bản cần dịch'});
  await input.fill('Tôi muốn đi Nhật Bản.');
  await tool.getByRole('button',{name:'Dịch câu',exact:true}).click();
  await tool.getByText('日本へ行きたいです。',{exact:true}).waitFor();
  await tool.getByText('Thiết lập AI và lịch sử bản dịch',{exact:true}).click();
  const history=tool.locator('[data-translation-history]');
  await history.getByText('テレビを見ています。',{exact:true}).waitFor();
  await history.getByRole('button',{name:'Đánh dấu',exact:true}).click();
  await history.getByRole('button',{name:'Bỏ đánh dấu',exact:true}).waitFor();
  await context.setOffline(true);
  await history.getByRole('button',{name:'Mở bản dịch',exact:true}).click();
  await tool.locator('[data-translation-result]').getByText('Đang xem TV.',{exact:true}).waitFor();
  await history.getByRole('button',{name:'Xóa toàn bộ lịch sử dịch',exact:true}).click();
  await history.getByText('Chưa có bản dịch đã lưu.',{exact:true}).waitFor();
  await context.setOffline(false);
  const backup={format:'n5-translation-memory-v1',rows:[{text:'本を読みます。',direction:'ja-vi',marked:true,
    result:{translatedText:'Đọc sách.',japaneseText:'本を読みます。'}}]};
  await tool.locator('[data-translation-import]').setInputFiles({name:'marked.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(backup))});
  const importStatus=tool.getByRole('status');
  await tool.getByText(/Đã nhập|Không đọc được/).waitFor();
  assert.match(await importStatus.textContent(),/Đã nhập 1 câu mới/);
  await history.getByText('Đọc sách.',{exact:true}).waitFor();
  await history.getByText(/Bản dịch đã nhập/).waitFor();
  await history.getByRole('button',{name:'Xóa',exact:true}).click();
  await history.getByText('Chưa có bản dịch đã lưu.',{exact:true}).waitFor();
});

test('AI respects manual mode, caches and cancels requests, and renders provider text safely', {timeout:90_000}, async t => {
  const {page}=await openApp(t);
  let calls=0, status=200, error='', hold=false, releaseHold;
  await page.evaluate(()=>localStorage.setItem('n5_translation_mode_v1','request'));
  let notifyHold;
  const receivedHeldRequest=new Promise(resolve=>{notifyHold=resolve;});
  const {translationSchema}=await import('../../assets/translation/protocol.js');
  const shell=Object.fromEntries(translationSchema.required.map(key=>[
    key,translationSchema.properties[key].type==='array'?[]:'',
  ]));
  mockCloud=async (request,response,url)=>{
    assert.equal(url.pathname,mockPath+'/functions/v1/smart-translate');
    calls++;
    assert.equal(request.headers.authorization,'Bearer session-test');
    let body='';
    for await (const chunk of request) body+=chunk;
    const {text,direction,...extra}=JSON.parse(body);
    assert.equal(direction,'ja-vi');
    assert.deepEqual(extra,{});
    if (hold) await new Promise(resolve=>{releaseHold=resolve;response.once('close',resolve);notifyHold();});
    if (response.destroyed) return;
    response.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(status===200?{
      ...shell,detectedLanguage:'ja',originalText:text,model:'gemini-test',
      translatedText:'<img src=x onerror=alert(1)>',japaneseText:text,
      kanaReading:'てんたいぶつりがくではブラックホールをけんきゅうします。',
      romaji:'tentai butsurigaku de wa burakku hooru o kenkyuu shimasu',
      literalTranslation:'Bản dịch thử sát nghĩa.', grammarPatterns:[{pattern:'では',explanation:'Phạm vi nghiên cứu.'}],
    }:{error}));
  };
  t.after(()=>{releaseHold?.();mockCloud=null;});
  const phrase='天体物理学ではブラックホールを研究します。';
  const inline=page.locator('[data-n5-translation-slot]');
  await lookup(page,phrase);
  await inline.getByText(/Chưa đủ căn cứ/).waitFor();
  assert.equal(calls,0);
  const ai=inline.getByRole('button',{name:'Dịch chuyên sâu bằng AI'});
  await ai.click();
  await inline.getByText(/Đăng nhập trong Sao lưu/).waitFor();
  await page.evaluate(()=>{
    n5CloudStoreSession({access_token:'session-test',refresh_token:'refresh-test',user:{id:'test-user'},expires_in:3600});
  });
  status=403;
  error='forbidden';
  await ai.click();
  await inline.getByText(/chưa được cấp quyền/).waitFor();
  status=503;
  error='unconfigured';
  await ai.click();
  await inline.getByText('Chưa kết nối Gemini.',{exact:true}).waitFor();
  status=200;
  await ai.click();
  await inline.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();
  assert.equal(await inline.locator('img').count(),0);
  await inline.getByText(/Bản dịch đã lưu/).waitFor();
  const used=calls;
  assert.equal(await ai.count(),0);
  assert.equal(await inline.getByRole('button',{name:'Dịch lại bằng AI',exact:true}).count(),1);
  assert.equal(await inline.getByRole('button',{name:'Nghe tiếng Nhật',exact:true}).count(),1);
  assert.equal(await inline.getByRole('button',{name:'Kiểm tra câu',exact:true}).count(),1);
  const sentence=page.locator('[data-result-sentence]');
  assert.equal(await sentence.getByText(phrase,{exact:true}).count(),1);
  assert.match(await sentence.locator('[data-result-reading="Kana"]').textContent(),/ブラックホール.*Gemini/);
  const overview=sentence.getByRole('tab',{name:'Tổng hợp',exact:true});
  await overview.focus();
  await overview.press('End');
  assert.equal(await sentence.getByRole('tab',{name:'Phân tích chi tiết'}).getAttribute('aria-selected'),'true');
  await sentence.getByText('Đối chiếu cách đọc',{exact:true}).waitFor();
  await page.locator('#mainContainer').getByRole('button',{name:'Phân tích câu',exact:true}).click();
  assert.equal(await sentence.getByRole('tab',{name:'Phân tích chi tiết'}).getAttribute('aria-selected'),'true');
  await inline.getByText(/Bản dịch đã lưu/).waitFor();
  assert.equal(calls,used);
  await lookup(page,'テレビを見ています。');
  await lookup(page,phrase);
  await inline.getByText(/Bản dịch đã lưu/).waitFor();
  assert.equal(calls,used);
  await go(page,'translator');
  const tool=page.locator('[data-n5-translation-tool]');
  await tool.getByText('Thiết lập AI và lịch sử bản dịch',{exact:true}).click();
  await tool.locator('[data-translation-mode]').selectOption('auto');
  await lookup(page,'毎日、日本語を勉強します。');
  await inline.getByText(/Bản dịch đối chiếu/).waitFor();
  assert.equal(calls,used);
  const search=page.locator('#globalSearchInput');
  hold=true;
  await search.fill('世界の天体を観測して分析してください。');
  const preview=page.locator('#n5InstantLookup:not([hidden])');
  await preview.getByText('Đang dịch bằng Gemini…',{exact:true}).waitFor();
  await receivedHeldRequest;
  assert.equal(calls,used+1);
  await inline.getByText(/Bản dịch đối chiếu/).waitFor();
  await search.fill('テレビを見ています。');
  await search.press('Enter');
  await inline.getByText('Đang xem TV.',{exact:true}).waitFor();
  releaseHold?.();
  assert.equal(await inline.getByText('<img src=x onerror=alert(1)>',{exact:true}).count(),0);
});

test('shared result panels have clear contrast, responsive order and reduced motion', {timeout:60_000}, async t => {
  for (const [settings,mobile] of [
    [{viewport:{width:1440,height:900},colorScheme:'light',reducedMotion:'reduce'},false],
    [{...playwright.devices['iPhone 13'],colorScheme:'dark'},true],
  ]) {
    const {page}=await openApp(t,settings);
    await lookup(page,'テレビを見ています。');
    const result=page.locator('[data-result-sentence]');
    await result.locator('.n5-translation-output').getByText('Đang xem TV.',{exact:true}).waitFor();
    const measured=await result.evaluate(root=>{
      const luminance=color=>{
        const channels=color.match(/[0-9.]+/g).slice(0,3).map(n=>Number(n)/255)
          .map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
        return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
      };
      const measure=element=>{
        const panel=getComputedStyle(element);
        const title=getComputedStyle(element.querySelector('h2,h3'));
        const values=[luminance(panel.backgroundColor),luminance(panel.color),luminance(title.color)];
        const contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        return {box:element.getBoundingClientRect().toJSON(),heading:contrast(values[0],values[2]),
          body:contrast(values[0],values[1])};
      };
      return {source:measure(root.querySelector('.n5-result-source')),translation:measure(root.querySelector('.n5-translation-result')),
        width:document.documentElement.scrollWidth,touchWidth:innerWidth,viewHeight:innerHeight,
        renderedTranslation:root.querySelector('.n5-translation-output').getBoundingClientRect().bottom,
        motion:getComputedStyle(root.querySelector('.n5-result-toolbar button')).transitionDuration};
    });
    for (const panel of [measured.source,measured.translation]) {
      assert(panel.body>=4.5,JSON.stringify(panel));
      assert(panel.heading>=4.5,JSON.stringify(panel));
    }
    assert(measured.width<=measured.touchWidth);
    assert(measured.renderedTranslation<=measured.viewHeight);
    if (mobile) assert(measured.translation.box.top>=measured.source.box.bottom);
    else {
      assert.equal(measured.translation.box.top,measured.source.box.top);
      assert(measured.translation.box.left>=measured.source.box.right);
      assert.equal(measured.motion,'0s');
    }
    const toolbar=result.locator('.n5-result-toolbar');
    for (const name of ['Nghe tiếng Nhật','Sao chép bản dịch','Lưu câu','Kiểm tra câu','Dịch chuyên sâu bằng AI']) {
      assert.equal(await toolbar.getByRole('button',{name,exact:true}).count(),1);
    }
    if (mobile) {
      const top=page.locator('#backToTopBtn');
      await top.waitFor({state:'hidden'});
      await page.evaluate(()=>window.scrollTo({top:240,behavior:'instant'}));
      await top.waitFor();
    }
  }
});

test('mobile live lookup keeps IME and caret, opens a suggestion and follows contextual input', {timeout:90_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'},()=>{
    window.lookupScrollCalls=0;
    const scrollTo=window.scrollTo.bind(window);
    window.scrollTo=(...args)=>{window.lookupScrollCalls++;return scrollTo(...args);};
  });
  const input=page.locator('#globalSearchInput');
  const preview=page.locator('#n5InstantLookup');
  await input.focus();
  await page.evaluate(()=>{window.lookupScrollCalls=0;});
  await input.pressSequentially('kodomotach',{delay:30});
  await preview.getByText('Những đứa trẻ',{exact:true}).waitFor({timeout:20_000});
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  assert(await preview.getByRole('button',{name:/子どもたち/}).getByText(/こどもたち/).isVisible());
  assert(await preview.locator('button:not([data-lookup="preview-commit"])').count()<=3);
  assert(await input.evaluate(element=>document.activeElement===element && element.selectionStart===10));
  assert.equal(await page.evaluate(()=>window.lookupScrollCalls),0);

  await input.press('Backspace');
  await input.press('h');
  await preview.getByText('Những đứa trẻ',{exact:true}).waitFor();
  await preview.getByRole('button',{name:/子どもたち/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'子どもたち',exact:true}).waitFor();
  assert(await dialog.getByText(/子供達/).isVisible());
  const contextual=dialog.getByRole('searchbox');
  await contextual.focus();
  await contextual.dispatchEvent('compositionstart');
  await contextual.fill('泣いて');
  await page.waitForTimeout(400);
  assert.equal(await dialog.locator('[data-context-result]').count(),0);
  await contextual.fill('泣いてい');
  await contextual.dispatchEvent('compositionend');
  const contextResult=dialog.locator('[data-context-result="泣いてい"]');
  await contextResult.getByRole('button',{name:/泣いていい/}).waitFor();
  assert(await contextual.evaluate(element=>document.activeElement===element && element.selectionStart===element.value.length));
  await contextResult.getByRole('button',{name:/泣いていい/}).click();
  await dialog.getByRole('heading',{name:'泣いていい',exact:true}).waitFor();
  assert(await dialog.locator('.n5-lookup-form').getByText('Được phép khóc',{exact:true}).isVisible());
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await contextResult.getByRole('button',{name:/泣いている/}).waitFor();
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await input.inputValue(),'kodomotach');
  assert(await input.evaluate(element=>element===document.activeElement));
});

test('inline live preview uses the latest paste and composes local translations offline', {timeout:90_000}, async t => {
  const {page}=await openApp(t,{viewport:{width:1280,height:800}});
  const input=page.locator('#globalSearchInput');
  const preview=page.locator('#n5InstantLookup');
  const external=[];
  page.on('request',request=>{
    if (request.url().includes('/functions/v1/smart-translate')) external.push(request.url());
  });
  networkAvailable=false;
  t.after(()=>{networkAvailable=true;});
  await page.reload();
  await input.focus();
  await input.dispatchEvent('compositionstart');
  await input.fill('風が');
  await page.waitForTimeout(400);
  assert.equal(await preview.isVisible(),false);
  assert.equal(await page.locator('[data-lookup-query="風が"]').count(),0);
  await input.dispatchEvent('compositionend');
  await input.fill('naitei');
  await input.fill('風が吹いています。');
  await input.dispatchEvent('input',{inputType:'insertFromPaste',data:'風が吹いています。'});
  await preview.getByText('Gió đang thổi.',{exact:true}).waitFor({timeout:20_000});
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await input.press('Enter');
  const result=page.locator('[data-lookup-query="風が吹いています。"]');
  await result.locator('[data-n5-translation-slot]').getByText('Gió đang thổi.',{exact:true}).waitFor();
  assert(await result.locator('[data-result-panel="overview"] .n5-lookup-path')
    .getByText('吹く → 吹いて → 吹いている → 吹いています',{exact:true}).isVisible());
  assert(await input.evaluate(element=>document.activeElement===element));
  await input.fill('naitei');
  await preview.getByText('内定',{exact:true}).waitFor();
  await input.press('Enter');
  const ambiguous=page.locator('[data-lookup-query="naitei"]');
  for (const form of ['泣いている','泣いています','泣いていい','泣いていた']) {
    await ambiguous.locator(`[data-lookup-form-surface="${form}"] button`).waitFor();
  }
  assert.equal(await ambiguous.locator('[data-result-sentence]').count(),0);
  assert.deepEqual(external,[]);
});

test('handwriting dialog keeps controls visible and scrolls internally at normal and zoom-equivalent layouts', {timeout:120_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:720},deviceScaleFactor:1.5});
  const input = page.locator('#globalSearchInput');
  await input.fill('nihongo');
  await input.press('Enter');
  await page.locator('[data-lookup-query="nihongo"]').waitFor();
  const toggle = page.locator('#handwritingSearchToggle');
  await toggle.click();
  const panel = page.getByRole('dialog',{name:'Viết Kanji để tra cứu'});
  const close = panel.getByRole('button',{name:'Đóng bảng viết'});
  const board = panel.locator('canvas');
  const body = panel.locator('.n5-handwriting-body');
  const recognize = panel.getByRole('button',{name:'Nhận diện',exact:true});
  await page.waitForFunction(() => !!handwritingCanvas);
  assert(await close.evaluate(button=>button===document.activeElement));
  await page.keyboard.press('Tab');
  assert(await panel.evaluate(dialog=>dialog.contains(document.activeElement)));
  const box = await board.boundingBox();
  await board.evaluate(canvas=>canvas.addEventListener('gotpointercapture',()=>{canvas.dataset.captured='true';},{once:true}));
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.3);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width+12,box.y+box.height*.59,{steps:10});
  await page.mouse.up();
  assert.equal(await board.getAttribute('data-captured'),'true');
  assert.equal(await page.evaluate(()=>handwritingStrokes.length),1);
  const first = await page.evaluate(()=>handwritingStrokes);
  await panel.getByRole('button',{name:'Hoàn tác'}).click();
  assert.equal(await page.evaluate(()=>handwritingStrokes.length),0);
  await panel.getByRole('button',{name:'Làm lại'}).click();
  assert.deepEqual(await page.evaluate(()=>handwritingStrokes),first);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{
    const c=document.getElementById('handwritingSearchCanvas');
    return Math.abs(c.width-c.getBoundingClientRect().width*devicePixelRatio)<1;
  });
  assert.deepEqual(await page.evaluate(()=>handwritingStrokes),first);
  assert(await board.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,i)=>i%4===3 && value>0)));
  await panel.getByRole('button',{name:'Xóa nét'}).click();
  await page.evaluate(async ()=>{
    const {bytes,records}=await n5InitHandwritingIndex();
    handwritingStrokes=n5DecodeHandwritingStrokes(records.find(record=>record.char==='着'),bytes)
      .map(stroke=>stroke.map(([x,y])=>[x*480,y*480]));
    handwritingCanvas.redraw();
  });
  await panel.getByRole('button',{name:'Trong bài N5',exact:true}).click();
  const expand = panel.getByRole('button',{name:'Thử kho mở rộng'});
  await expand.waitFor();
  assert.match(await panel.locator('#handwritingSearchResults').innerText(),/161 mẫu ngoại tuyến/);
  await expand.click();
  await panel.locator('[data-handwriting-char="着"]').waitFor();
  assert.match(await panel.locator('#handwritingSearchResults').innerText(),/Kho mở rộng · 6[.\s]703 mẫu ngoại tuyến/);

  for (const [width,height,columns] of [[1920,1080,2],[1366,768,2],[1280,720,2],[390,844,1],[375,667,1],
      [1093,614,2],[910,512,1]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(({width,height})=>innerWidth===width && innerHeight===height,{width,height});
    const geometry = await panel.evaluate(dialog=>{
      const panel=dialog.getBoundingClientRect();
      const scroll=dialog.querySelector('.n5-handwriting-body');
      const footer=dialog.querySelector('footer').getBoundingClientRect();
      const close=dialog.querySelector('[aria-label="Đóng bảng viết"]').getBoundingClientRect();
      return {top:panel.top,bottom:panel.bottom,left:panel.left,right:panel.right,xOverflow:scroll.scrollWidth-scroll.clientWidth,
        footer:footer.bottom,close:close.top,columns:getComputedStyle(dialog.querySelector('.n5-handwriting-layout')).gridTemplateColumns.split(' ').length};
    });
    assert(geometry.top>=0 && geometry.bottom<=height && geometry.left>=0 && geometry.right<=width,JSON.stringify(geometry));
    assert(geometry.xOverflow<=1 && geometry.footer<=height && geometry.close>=0,JSON.stringify(geometry));
    assert.equal(geometry.columns,columns,width+' × '+height);
    await body.evaluate(scroller=>{scroller.scrollTop=scroller.scrollHeight;});
    const last = await panel.locator('.handwriting-candidate').last().boundingBox();
    const scroller = await body.boundingBox();
    assert(last && scroller && last.y>=scroller.y-1 && last.y+last.height<=scroller.y+scroller.height+1);
  }
  await body.evaluate(scroller=>{scroller.scrollTop=0;});
  const before = await page.evaluate(()=>[window.scrollY,document.getElementById('mainContainer').scrollTop]);
  const wheel = await board.boundingBox();
  await page.mouse.move(wheel.x+wheel.width/2,wheel.y+20);
  await page.mouse.wheel(0,650);
  await page.waitForFunction(()=>document.querySelector('.n5-handwriting-body').scrollTop>0);
  assert.deepEqual(await page.evaluate(()=>[window.scrollY,document.getElementById('mainContainer').scrollTop]),before);
  const strokes = await page.evaluate(()=>handwritingStrokes);
  await page.keyboard.press('Escape');
  await panel.waitFor({state:'hidden'});
  assert.equal(await input.inputValue(),'nihongo');
  await page.waitForFunction(()=>document.activeElement?.id==='handwritingSearchToggle');
  await toggle.click();
  assert.deepEqual(await page.evaluate(()=>handwritingStrokes),strokes);
  await panel.locator('[data-handwriting-char="着"]').click();
  await panel.waitFor({state:'hidden'});
  const result = page.locator('[data-lookup-query="着"]');
  await result.getByText(/mặc quần áo; mặc áo/).waitFor();
  assert.equal(await input.inputValue(),'着');
  assert(await page.evaluate(()=>n5LookupRecent().includes('着')));
  await result.locator('[data-result-type="kanji"]').first().getByRole('button').click();
  const detail = page.getByRole('dialog',{name:'着'});
  await detail.getByText('Âm Kun',{exact:true}).waitFor();
  await detail.getByRole('button',{name:'着る',exact:true}).waitFor();
  await detail.getByText('Thứ tự nét · 12 nét',{exact:true}).click();
  assert.equal(await detail.locator('.n5-lookup-strokes path').count(),12);
});

test('recognizer ranks both scopes with complete, reordered, missing and extra strokes', {timeout:120_000}, async t => {
  const {page} = await openApp(t,{viewport:{width:1280,height:800}});
  const trials = await page.evaluate(async ()=>{
    const {bytes,records}=await n5InitHandwritingIndex();
    const result = [];
    for (const char of '着知折新電食見聞書語') {
      const record = records.find(record=>record.char===char);
      const points = n5DecodeHandwritingStrokes(record,bytes).map(line=>line.map(([x,y])=>[x*480,y*480]));
      const extra = [...points,[[214,226],[228,228]]];
      const variants = [points,[...points].reverse(),points.slice(0,-1),extra];
      for (const [index,strokes] of variants.entries()) {
        for (const scope of ['n5','all']) {
          const {scored,sampleCount}=n5RankHandwriting(handwritingNormalizeStrokes(strokes),scope,records,bytes);
          result.push({char,scope,index,sampleCount,course:record.course,first:scored[0]?.char,
            offered:scored.map(item=>item.char),allCourse:scored.every(item=>item.course)});
        }
      }
    }
    return result;
  });
  assert.equal(trials.length,80);
  for (const trial of trials) {
    const {char,scope,index,first,offered,sampleCount,allCourse,course} = trial;
    assert.equal(new Set(offered).size,offered.length);
    assert(offered.length>1);
    assert.equal(sampleCount,scope==='n5'?161:6703);
    if (scope==='n5') assert(allCourse && !offered.includes('着'));
    if (index<2 && (course || scope==='all')) assert.equal(first,char);
    if (index>=2 && char==='着' && scope==='all') assert(offered.includes(char));
  }
});

test('mobile handwriting accepts touch, supports offline lookup, and keeps homophones visible', {timeout:120_000}, async t => {
  const {page} = await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'light',viewport:{width:375,height:667}});
  networkAvailable = false;
  t.after(()=>{networkAvailable=true;});
  await page.reload();
  await page.locator('#handwritingSearchToggle').tap();
  const dialog = page.getByRole('dialog',{name:'Viết Kanji để tra cứu'});
  await page.waitForFunction(()=>!!handwritingCanvas);
  await page.evaluate(async ()=>{
    const {bytes,records}=await n5InitHandwritingIndex();
    const strokes = n5DecodeHandwritingStrokes(records.find(record=>record.char==='着'),bytes);
    const canvas = document.getElementById('handwritingSearchCanvas');
    const r=canvas.getBoundingClientRect();
    let pointerId=50;
    for (const stroke of strokes) {
      pointerId++;
      const fire=(type,[x,y])=>canvas.dispatchEvent(new PointerEvent(type,{
        clientX:r.left+x*r.width,clientY:r.top+y*r.height,pointerId,pointerType:'touch',isPrimary:true,button:0,bubbles:true,
      }));
      fire('pointerdown',stroke[0]);
      for (const point of stroke.slice(1)) fire('pointermove',point);
      fire(pointerId===51?'pointercancel':'pointerup',stroke.at(-1));
    }
  });
  assert.equal(await dialog.locator('[data-n5-handwriting-scope="smart"]').getAttribute('aria-pressed'),'true');
  await dialog.locator('[data-handwriting-char="着"]').tap();
  await page.locator('[data-lookup-query="着"]').waitFor();
  const input = page.locator('#globalSearchInput');
  await input.fill('kite');
  const preview = page.locator('#n5InstantLookup');
  await preview.getByText('Mặc quần áo',{exact:true}).waitFor();
  assert(await preview.getByText('Đến',{exact:true}).isVisible());
  await input.fill('シャツを着ています。');
  await preview.getByText('Đang mặc áo sơ mi.',{exact:true}).waitFor();
});

test('preview from study pages preserves the route, and committed homophones are expandable', {timeout:120_000}, async t => {
  const {page}=await openApp(t,{viewport:{width:1366,height:768}});
  const search=page.locator('#globalSearchInput');
  const preview=page.locator('#n5InstantLookup');
  const content=page.locator('#mainContainer');
  for (const route of ['dashboard','vocab','kanji','grammar','flashcard','formPractice','reading']) {
    await go(page,route);
    const heading=await content.locator('h1').first().textContent();
    await search.fill('shuukan');
    await preview.getByText('週刊',{exact:true}).waitFor();
    assert.equal(await content.getAttribute('data-n5-page'),route);
    assert.equal(await content.locator('h1').first().textContent(),heading);
    assert(await preview.getByText('週間',{exact:true}).isVisible());
    await search.press('Escape');
    await preview.waitFor({state:'hidden'});
    await search.fill('');
  }
  await go(page,'vocab');
  await search.fill('kami');
  await preview.getByText('神',{exact:true}).waitFor();
  await search.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');
  await dialog.getByText('Từ loại',{exact:true}).waitFor();
  assert.equal(await content.getAttribute('data-n5-page'),'vocab');
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await search.press('Enter');
  const full=page.locator('[data-lookup-query="kami"]');
  const group=full.locator('[data-homophones]');
  await group.getByText(/Xem tất cả từ đồng âm/).click();
  for (const word of ['紙','髪','神']) {
    assert(await group.getByRole('button',{name:new RegExp(word)}).first().isVisible(),word);
  }
  assert(await page.evaluate(()=>n5LookupRecent().includes('kami')));
});

test('furigana clipboard handling keeps original, redraws only the accepted query, and removes ruby from copy', {timeout:120_000}, async t => {
  const {page}=await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'light'});
  const input=page.locator('#globalSearchInput');
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(item=>item.name.endsWith('/assets/search/furigana-normalizer.js')));
  async function paste(original,html='') {
    await input.fill('');
    await input.evaluate((field,{original,html})=>{
      const data=new DataTransfer();
      data.setData('text/plain',original);
      if(html) data.setData('text/html',html);
      const accepted=field.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
      if (accepted) {
        field.setRangeText(original,field.selectionStart,field.selectionEnd,'end');
        field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:original}));
      }
    },{original,html});
  }
  await paste('日に本ほん語ご');
  const notice=page.locator('.n5-paste-note');
  await notice.getByText('Đề xuất · 日本語',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'日に本ほん語ご');
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await notice.getByRole('button',{name:'Sử dụng bản chuẩn hóa'}).click();
  assert.equal(await input.inputValue(),'日本語');
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await paste('漢(かん)字(じ)を読む。','<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rt>じ</rt></ruby>を読む。<script>throw Error(1)</script>');
  assert.equal(await input.inputValue(),'漢字を読む。');
  await notice.getByRole('button',{name:'Hoàn tác'}).click();
  assert.equal(await input.inputValue(),'漢(かん)字(じ)を読む。');
  const copied=await page.evaluate(()=>{
    document.activeElement.blur();
    const demo=document.createElement('div');
    demo.innerHTML='<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>を読む。';
    document.querySelector('#mainContainer').append(demo);
    const range=document.createRange();
    range.selectNodeContents(demo);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    const data=new DataTransfer();
    demo.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
    demo.remove();getSelection().removeAllRanges();
    return data.getData('text/plain');
  });
  assert.equal(copied,'漢字を読む。');
});

test('grammar Q&A and exact expanded stroke data remain available offline once cached', {timeout:120_000}, async t => {
  const {page}=await openApp(t,{viewport:{width:1280,height:720},colorScheme:'dark'});
  await go(page,'grammar');
  const article=page.locator('[data-course-question-topic="g1a_2"] [data-grammar-qa]');
  await article.getByText('Cách hỏi & trả lời',{exact:true}).click();
  assert(await article.getByText('いいえ、学生ではありません。',{exact:true}).isVisible());
  await lookup(page,'折');
  await page.locator('[data-result-type="kanji"]').getByRole('button',{name:'折',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'骨折',exact:true}).waitFor();
  await dialog.getByText('Thứ tự nét · 7 nét',{exact:true}).click();
  await dialog.getByRole('button',{name:'Phát từng nét'}).click();
  await dialog.getByText(/\/ 7 nét/).waitFor();
  await dialog.getByRole('button',{name:'Tạm dừng'}).click();
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await lookup(page,'shuumatsu');
  assert(await page.locator('[data-lookup-query="shuumatsu"]').getByText('週末',{exact:true}).first().isVisible());
  networkAvailable=false;
  t.after(()=>{networkAvailable=true;});
  await page.reload();
  const typography=await page.evaluate(async()=>{
    await document.fonts.load('700 20px "Plus Jakarta Sans"','Học tiếng Nhật');
    await document.fonts.load('400 16px "Be Vietnam Pro"','Tiếng Việt');
    await document.fonts.load('400 16px "Noto Sans JP"','日本語');
    return [...document.fonts].filter(font=>font.status==='loaded').map(font=>font.family);
  });
  assert(['Plus Jakarta Sans','Be Vietnam Pro','Noto Sans JP'].every(font=>typography.includes(font)));
  await lookup(page,'shuumatsu');
  assert(await page.locator('[data-lookup-query="shuumatsu"]').getByText('週末',{exact:true}).first().isVisible());
  await page.evaluate(()=>openGrammarStructureFromSearch('g6c_10'));
  const question=dialog.locator('[data-grammar-qa] > .n5-qa-topic').filter({hasText:'どこで日本語を勉強しますか。'});
  await question.getByText('Tự trả lời',{exact:true}).click();
  await question.locator('[data-qa-reply]').fill('図書館で勉強します。');
  await question.getByRole('button',{name:'Kiểm tra câu trả lời'}).click();
  assert.equal(await dialog.locator('[data-n5-checker] textarea').inputValue(),'図書館で勉強します。');
});

test('default automatic translation handles paragraphs without Enter and guards quota and modes', {timeout:120_000}, async t => {
  const {page}=await openApp(t);
  await page.evaluate(()=>n5CloudStoreSession({
    access_token:'session-test',refresh_token:'refresh-test',user:{id:'test-user'},expires_in:3600,
  }));
  const calls=[];
  const {translationSchema}=await import('../../assets/translation/protocol.js');
  const shell=Object.fromEntries(translationSchema.required.map(key=>[key,translationSchema.properties[key].type==='array'?[]:'']));
  let exhausted=false;
  mockCloud=async (request,response,url)=>{
    assert.equal(url.pathname,mockPath+'/functions/v1/smart-translate');
    let body='';
    for await (const chunk of request) body+=chunk;
    const {text,direction}=JSON.parse(body);
    calls.push({text,direction});
    response.writeHead(exhausted?429:200,{'Content-Type':'application/json'}).end(JSON.stringify(exhausted?{error:'quota'}:{
      ...shell,detectedLanguage:direction==='vi-ja'?'vi':'ja',originalText:text,model:'gemini-test',
      translatedText:'Bản dịch thử nghiệm toàn đoạn.',japaneseText:text,
      literalTranslation:'Bản dịch sát nghĩa.',sentenceStructure:['Phân tích cấu trúc thử nghiệm.'],
    }));
  };
  t.after(()=>{mockCloud=null;});
  const search=page.locator('#globalSearchInput');
  const preview=page.locator('#n5InstantLookup');
  await search.fill('玄関');
  await preview.getByText(/lối vào nhà/).first().waitFor();
  await search.fill('テレビを見ています。');
  await preview.getByText('Đang xem TV.',{exact:true}).waitFor();
  assert.equal(calls.length,0);
  const phrase='昨日は雨が降っていたので、家で日本語を勉強してから、友達と電話で話しました。';
  const passage=Array(10).fill(phrase).join('\n\n');
  await search.dispatchEvent('compositionstart');
  await search.fill(phrase);
  await page.waitForTimeout(1000);
  assert.equal(calls.length,0);
  await search.dispatchEvent('compositionend');
  await preview.getByText('Bản dịch thử nghiệm toàn đoạn.',{exact:true}).waitFor();
  assert.equal(calls.length,1);
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),'dashboard');
  await search.press('Enter');
  const inline=page.locator('[data-n5-translation-slot]');
  await inline.getByText(/Bản dịch đã lưu/).first().waitFor();
  assert.equal(calls.length,1);
  await go(page,'translator');
  const tool=page.locator('[data-n5-translation-tool]');
  const input=tool.locator('[name="text"]');
  await input.fill(passage);
  await tool.locator('[data-translation-result]').getByText('Bản dịch thử nghiệm toàn đoạn.',{exact:true}).waitFor();
  assert.deepEqual(calls.at(-1),{text:passage,direction:'ja-vi'});
  assert.equal(calls.length,2);
  await input.fill('日'.repeat(3001));
  await tool.getByText(/3\.000 ký tự/).last().waitFor();
  assert.equal((await input.inputValue()).length,3001);
  assert.equal(calls.length,2);
  exhausted=true;
  await input.fill('日本語を勉強しているので、毎日日本のニュースを読むようにしています。');
  await tool.getByText(/Đã chạm giới hạn/).waitFor();
  await input.fill('日本へ行ったことはありませんが、いつか行きたいと思っています。');
  await tool.getByText(/Đã chạm giới hạn/).waitFor();
  assert.equal(calls.length,3);
  await tool.getByText('Thiết lập AI và lịch sử bản dịch',{exact:true}).click();
  await tool.locator('[data-translation-mode]').selectOption('offline');
  await input.fill('時間があれば、駅の近くにある本屋へ行って、日本語の本を買いたいです。');
  await tool.getByText(/Chưa đủ căn cứ/).waitFor();
  assert.equal(calls.length,3);
});

test('lookup opens from Japanese text and the mobile sheet and reading settings preserve study context', {timeout:120_000}, async t => {
  const {page}=await openApp(t,{...playwright.devices['iPhone 13'],colorScheme:'dark'});
  await go(page,'reading');
  const paragraph=page.locator('[data-n5-tappable]').first();
  await paragraph.waitFor();
  const snapshot=await page.locator('#mainContainer').getAttribute('data-n5-page');
  await paragraph.press('Enter');
  const dialog=page.getByRole('dialog');
  await dialog.locator('[data-context-result]').waitFor();
  await dialog.locator('button[data-lookup="part"]').first().click();
  const handle=dialog.getByRole('button',{name:'Mở rộng chi tiết',exact:true});
  await handle.click();
  assert.equal(await dialog.locator('.n5-sheet-grab').getAttribute('aria-expanded'),'true');
  await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
  await dialog.locator('[data-context-result]').waitFor();
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  assert.equal(await page.locator('#mainContainer').getAttribute('data-n5-page'),snapshot);
  await page.evaluate(()=>{
    const example=document.createElement('p');
    example.id='test-tap-sample';
    example.dataset.n5Tappable='';
    example.lang='ja';
    example.tabIndex=0;
    example.textContent='日本語を勉強しています。';
    document.querySelector('#mainContainer').prepend(example);
  });
  const sample=page.locator('#test-tap-sample');
  const point=await sample.evaluate(node=>{
    const range=document.createRange();
    range.setStart(node.firstChild,5);range.setEnd(node.firstChild,6);
    const hit=range.getBoundingClientRect();
    const ref=node.getBoundingClientRect();
    return {x:hit.left-ref.left+hit.width/2,y:hit.top-ref.top+hit.height/2};
  });
  await sample.tap({position:point});
  await dialog.getByRole('heading',{name:'勉強しています',exact:true}).waitFor();
  await dialog.getByText(/勉強する/).first().waitFor();
  const grab=dialog.locator('.n5-sheet-grab');
  await grab.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientY:100});
  await grab.dispatchEvent('pointerup',{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientY:175});
  await dialog.waitFor({state:'hidden'});

  await go(page,'backup');
  const settings=page.locator('[data-n5-reading-settings]');
  await settings.locator('[name="density"]').selectOption('compact');
  await settings.locator('[name="furigana"]').uncheck();
  assert.equal(await page.locator('html').getAttribute('data-n5-density'),'compact');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-n5-furigana'),'false');
  await go(page,'backup');
  await settings.getByRole('button',{name:'Khôi phục mặc định'}).click();
  assert.equal(await page.locator('html').getAttribute('data-n5-density'),'balanced');
});

test('live recognition returns independently authored 知 折 着 without manually changing scope', {timeout:120_000}, async t => {
  const {page}=await openApp(t,{viewport:{width:1366,height:768}});
  const samples=require('./handwriting-fixtures.cjs');
  await page.locator('#handwritingSearchToggle').click();
  const panel=page.locator('#handwritingSearchPanel');
  await page.waitForFunction(()=>!!handwritingCanvas);
  const box=await panel.locator('canvas').boundingBox();
  for (const [char,strokes] of Object.entries(samples)) {
    for (const line of strokes) {
      const point=([x,y])=>[box.x+box.width*x/100,box.y+box.height*y/100];
      await page.mouse.move(...point(line[0]));
      await page.mouse.down();
      for (const end of line.slice(1)) await page.mouse.move(...point(end),{steps:2});
      await page.mouse.up();
    }
    await panel.locator('[data-handwriting-char="'+char+'"]').waitFor();
    assert.equal(await panel.locator('[data-n5-handwriting-scope="smart"]').getAttribute('aria-pressed'),'true');
    await panel.getByRole('button',{name:'Xóa nét'}).click();
  }
});
