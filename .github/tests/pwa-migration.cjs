const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {createReadStream,existsSync,readFileSync} = require('node:fs');
const {extname,join,resolve,sep} = require('node:path');
const playwright = require('playwright');

const scope = '/n5-master-hub-forbegginer/';
const candidate = resolve(__dirname,'../..');
const engine = process.env.N5_TEST_BROWSER || 'chromium';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
  '.webmanifest':'application/manifest+json','.json':'application/json'};
const release = root => readFileSync(join(root,'index.html'),'utf8').match(/name="n5-release" content="([^"]+)"/)[1];

async function snapshot(page) {
  return page.evaluate(() => {
    const {exportedAt,version,...data} = n5BackupPayload();
    return {data,lookup:localStorage.getItem('n5_lookup_display_v1')};
  });
}

async function checkUpgrade() {
  if (!process.argv[2]) throw new Error('Provide a directory with the published v5.50 tree.');
  const baseline = resolve(process.argv[2]);
  const current = release(candidate);
  assert.equal(release(baseline),'5.50');
  assert.notEqual(current,'5.50');
  let source = baseline;
  let networkAvailable = true;
  const server = createServer((request,response) => {
    if (!networkAvailable) return response.writeHead(503).end();
    const {pathname} = new URL(request.url,'http://localhost');
    const file = resolve(source,pathname.slice(scope.length) || 'index.html');
    if (!pathname.startsWith(scope) || !file.startsWith(source + sep) || !types[extname(file)] || !existsSync(file)) {
      return response.writeHead(404).end();
    }
    response.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store'});
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve,reject) => server.listen(0,'127.0.0.1',resolve).once('error',reject));
  let browser;
  try {
    const site = 'http://localhost:' + server.address().port + scope;
    browser = await playwright[engine].launch({executablePath:process.env.N5_TEST_BROWSER_PATH || undefined});
    const context = await browser.newContext({...playwright.devices['iPhone 13']});
    await context.route('**/*',route => route.request().url().startsWith(site) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    page.on('dialog',dialog => dialog.accept());
    await page.goto(site,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.match(await page.title(),/v5\.50$/);
    await page.evaluate(() => {
      toggleBookmark('v6c_028');
      saveFlashcardKnowledge('v6c_028',true);
      n5SmartSaveQuery('nomu');
      localStorage.setItem('n5_lookup_display_v1',JSON.stringify({roman:false,furigana:true}));
    });
    await page.getByRole('button',{name:'Bắt đầu học 5 phút'}).click();
    await page.locator('[data-study-action="reveal"]').click();
    await page.waitForFunction(() => n5SmartStudy.snapshot().plan.revealed);
    await page.evaluate(async () => {
      navigateTo('backup');
      await n5SmartStudy.withLock(() => addStudyMistake({
        id:'g1a_1',contentId:'g1a_1',type:'grammar',question:'Câu sai đã lưu trên v5.50',
        chosenAnswer:'を',correctAnswer:'は',explanation:'は nêu chủ đề.',
      }));
    });
    const before = await snapshot(page);
    assert(before.data.bookmarks.includes('v6c_028'));
    assert(before.data.reviewData.v6c_028);
    assert(before.data.smartStudy.plan.revealed);
    assert(before.data.mistakes.some(item => item.question === 'Câu sai đã lưu trên v5.50'));

    source = candidate;
    await page.getByRole('button',{name:'Kiểm tra cập nhật'}).click();
    await page.getByRole('button',{name:'Cập nhật và mở lại'}).click({timeout:20_000});
    await page.waitForFunction(version => document.title.endsWith('v' + version),current);
    assert.deepEqual(await snapshot(page),before);
    await page.evaluate(() => navigateTo('backup'));
    await page.getByText('Phiên bản đang chạy v' + current,{exact:true}).waitFor();

    networkAvailable = false;
    await page.goto(site,{waitUntil:'domcontentloaded'});
    assert.deepEqual(await snapshot(page),before);
    const input = page.locator('#globalSearchInput');
    await input.fill('またがされました');
    await input.press('Enter');
    await page.locator('[data-lookup-state="ready"]').waitFor();
    await page.locator('.n5-lookup-form').getByText(/跨ぐ → 跨がせる → 跨がせられる → 跨がされる → 跨がされました/).waitFor();
    await input.fill('chậm nhất vào ngày mai');
    await input.press('Enter');
    await page.locator('[data-result-id="compare:deadline"] button').click();
    await page.getByRole('dialog').getByRole('rowheader',{name:'までに',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(engine + ': v5.50 → v' + current + ', backup and preferences preserved, offline lookup passed.');
  } finally {
    await browser?.close();
    server.close();
  }
}

checkUpgrade().catch(error => { console.error(error); process.exitCode = 1; });
