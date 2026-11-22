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
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
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
  await page.waitForFunction(() => document.getElementById('mainContainer').dataset.n5Page === 'global-search');
  assert.equal(await page.locator('#mainContainer h1').textContent(), 'Kết quả cho “食べませんでした”');
  await page.locator('[data-lookup-state="ready"]').waitFor();
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
  assert.equal(await page.locator('#mainContainer h1').textContent(), 'Kết quả cho “' + query + '”');
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
  assert(await main.getByText(/Chỉ người cùng thực hiện/).isVisible());
  assert(await main.getByText(/sau khi xem phim với bạn/).isVisible());
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
  const known = desktopPage.locator('[data-result-type="vocab"]').first();
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
  await page.getByRole('button',{name:'Xem toàn bộ phân tích'}).click();
  const analysis = page.locator('[data-lookup-analysis]');
  assert(await analysis.locator('.n5-lookup-phrases').getByText('Tân ngữ',{exact:true}).isVisible());
  assert(await analysis.getByText('Kho hiện tại chưa có bản dịch đối chiếu cho câu này.').isVisible());
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
  await page.evaluate(() => {
    window.scrollTo({top:600,behavior:'instant'});
    const input = document.getElementById('globalSearchInput');
    input.value = '飲む';
    input.dispatchEvent(new InputEvent('input',{bubbles:true}));
  });
  await page.locator('[data-lookup-state="ready"]').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.scrollY),0);
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
  await page.waitForFunction(() => document.activeElement?.id === 'globalSearchInput');
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
