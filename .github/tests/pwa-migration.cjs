const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {createReadStream,existsSync,readFileSync} = require('node:fs');
const {extname,join,resolve,sep} = require('node:path');
const playwright = require('playwright');

const scope = '/n5-master-hub-forbegginer/';
const candidate = resolve(__dirname,'../..');
const engine = process.env.N5_TEST_BROWSER || 'chromium';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
  '.webmanifest':'application/manifest+json','.json':'application/json','.bin':'application/octet-stream'};
const release = root => readFileSync(join(root,'index.html'),'utf8').match(/name="n5-release" content="([^"]+)"/)[1];
const previousRelease = '5.52.1';
const savedMistake = 'Câu sai đã lưu trên v' + previousRelease;

function checkKanjiAssets(baseline) {
  for (const asset of ['kanji-templates.bin','kanji-strokes.json']) {
    const before=readFileSync(join(baseline,'assets/data',asset));
    assert(readFileSync(join(candidate,'assets/data',asset)).equals(before),asset);
  }
}

async function snapshot(page) {
  return page.evaluate(() => {
    const {exportedAt,version,...data} = n5BackupPayload();
    return {data,lookup:localStorage.getItem('n5_lookup_display_v1')};
  });
}

async function checkUpgrade() {
  if (!process.argv[2]) throw new Error('Provide a directory with the published v' + previousRelease + ' tree.');
  const baseline = resolve(process.argv[2]);
  const current = release(candidate);
  assert.equal(release(baseline),previousRelease);
  assert.notEqual(current,previousRelease);
  checkKanjiAssets(baseline);
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
    assert.equal(await page.title(),'N5 Master Hub v' + previousRelease);
    await page.evaluate(() => {
      toggleBookmark('v6c_028');
      saveFlashcardKnowledge('v6c_028',true);
      n5SmartSaveQuery('nomu');
      localStorage.setItem('n5_lookup_display_v1',JSON.stringify({roman:false,furigana:true}));
    });
    await page.getByRole('button',{name:'Bắt đầu học 5 phút'}).click();
    await page.locator('[data-study-action="reveal"]').click();
    await page.waitForFunction(() => n5SmartStudy.snapshot().plan.revealed);
    await page.evaluate(async question => {
      navigateTo('backup');
      await n5SmartStudy.withLock(() => addStudyMistake({
        id:'g1a_1',contentId:'g1a_1',type:'grammar',question,
        chosenAnswer:'を',correctAnswer:'は',explanation:'は nêu chủ đề.',
      }));
    },savedMistake);
    const savedText='天体物理学ではブラックホールを研究します。';
    const savedTranslation='Vật lý thiên văn nghiên cứu lỗ đen.';
    await page.evaluate(async ({text,translatedText})=>{
      const {saveTranslation}=await import('./assets/translation/memory.js');
      await saveTranslation(text,'ja-vi',{source:'ai',version:'test',direction:'ja-vi',
        japaneseText:text,translatedText,kanaReading:'てんたいぶつりがくではブラックホールをけんきゅうします。'},{mark:true});
    },{text:savedText,translatedText:savedTranslation});
    const before = await snapshot(page);
    assert(before.data.bookmarks.includes('v6c_028'));
    assert(before.data.reviewData.v6c_028);
    assert(before.data.smartStudy.plan.revealed);
    assert(before.data.mistakes.some(item => item.question === savedMistake));

    source = candidate;
    await page.getByRole('button',{name:'Kiểm tra cập nhật'}).click();
    await page.getByRole('button',{name:'Cập nhật và mở lại'}).click({timeout:20_000});
    await page.waitForFunction(version => document.title.endsWith('v' + version),current);
    assert.deepEqual(await snapshot(page),before);
    await page.evaluate(() => navigateTo('backup'));
    await page.getByText('Phiên bản đang chạy v' + current,{exact:true}).waitFor();
    await page.evaluate(() => n5Effects.setMode('balanced'));

    networkAvailable = false;
    await page.goto(site,{waitUntil:'domcontentloaded'});
    assert.deepEqual(await snapshot(page),{...before,data:{...before.data,uiEffects:'balanced'}});
    assert.equal(await page.locator('html').getAttribute('data-n5-effect-mode'),'balanced');
    const input = page.locator('#globalSearchInput');
    await input.fill('テレビを見ています。');
    await input.press('Enter');
    await page.locator('[data-n5-translation-slot]').getByText('Đang xem TV.',{exact:true}).waitFor();
    await input.fill(savedText);
    await input.press('Enter');
    await page.locator('[data-n5-translation-slot]').getByText(savedTranslation,{exact:true}).waitFor();
    assert(await page.locator('[data-n5-translation-slot]').getByText(/Bản dịch đã lưu/).isVisible());
    assert(await page.evaluate(async text=>{
      const {findTranslation}=await import('./assets/translation/memory.js');
      return (await findTranslation(text,'ja-vi'))?.marked;
    },savedText));
    await input.fill('またがされました');
    await input.press('Enter');
    await page.locator('[data-lookup-state="ready"]').waitFor();
    await page.locator('.n5-lookup-form').getByText(/跨ぐ → 跨がせる → 跨がせられる → 跨がされる → 跨がされました/).waitFor();
    await input.fill('chậm nhất vào ngày mai');
    await input.press('Enter');
    await page.locator('[data-result-id="compare:deadline"] button').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('rowheader',{name:'までに',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.evaluate(() => n5OpenLearningTool('checker',document.getElementById('globalSearchInput'),{
      sentence:'毎日、日本語を勉強するます。',
    }));
    await dialog.locator('[data-checker-status="error"]').waitFor();
    await dialog.locator('[data-checker-practice]').click();
    await dialog.locator('[data-sentence-builder] .n5-builder-card').first().waitFor();
    assert.deepEqual(errors,[]);
    console.log(engine + ': v' + previousRelease + ' → v' + current +
      ', Kanji bytes verified, backup and preferences preserved, offline lookup and practice passed.');
  } finally {
    await browser?.close();
    server.close();
  }
}

checkUpgrade().catch(error => { console.error(error); process.exitCode = 1; });
