const playwright = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const scope = '/n5-master-hub-forbegginer/';
const engine = process.env.N5_TEST_BROWSER || 'chromium';
const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json'};
const queries = ['na','owaranai','tabesasenai','ikanakerebanaranai','nondekara','tabetakotogaaru','không được làm','muốn làm',
  'nihongoo','学校','ﾃﾚﾋﾞ','高くなかった','飲まなければならない','食べられる','昨日、友達と映画を見てから、ご飯を食べました。',
  '天体物理学ではブラックホールを研究します。'];
const desktop = {viewport:{width:1280,height:800}};
const mobile = {viewport:{width:390,height:844}, isMobile:true, hasTouch:true};
const median = values => {
  const sorted = values.slice().sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
};
const round = value => Math.round(value * 10) / 10;

async function serve(root) {
  const server = http.createServer((req,res) => {
    const {pathname} = new URL(req.url,'http://localhost');
    const file = path.resolve(root,pathname.slice(scope.length) || 'index.html');
    if (!pathname.startsWith(scope) || !file.startsWith(root + path.sep) || !mime[path.extname(file)] || !fs.existsSync(file)) {
      return res.writeHead(404).end();
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)], 'Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return {server, url:'http://localhost:' + server.address().port + scope};
}

async function measure(browser, url, options) {
  const context = await browser.newContext({...options,serviceWorkers:'block'});
  try {
    await context.route('**/*',route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    if (engine === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    }
    await page.goto(url,{waitUntil:'load'});
    await page.locator('.dashboard-hero').waitFor();
    return await page.evaluate(async ({queries}) => {
      const input = document.getElementById('globalSearchInput');
      const ready = '[data-lookup-state="ready"], #mainContainer .n5-smart-panel';
      const stats = [];
      for (const query of queries) {
        const start = performance.now();
        let last = start;
        let longestFrame = 0;
        input.value = query;
        input.dispatchEvent(new InputEvent('input',{bubbles:true}));
        await new Promise((resolve,reject) => {
          const poll = () => {
            const now = performance.now();
            longestFrame = Math.max(longestFrame,now-last);
            last = now;
            const heading = document.querySelector('#mainContainer h1');
            if (heading?.textContent === 'Kết quả cho “' + query + '”' && document.querySelector(ready)) {
              stats.push({query,ms:now-start,longestFrame});
              resolve();
            } else if (now - start > 15_000) {
              reject(new Error('Timed out waiting for lookup ' + query));
            } else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        });
      }
      return {stats,loadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd};
    },{queries});
  } finally {
    await context.close();
  }
}

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node search-benchmark.cjs /absolute/path/to/v5.48 [candidate-root]');
  const base = path.resolve(process.argv[2]);
  const candidate = path.resolve(process.argv[3] || path.join(__dirname,'../..'));
  const sites = await Promise.all([serve(base),serve(candidate)]);
  let browser;
  try {
    browser = await playwright[engine].launch({executablePath:process.env.N5_TEST_BROWSER_PATH || undefined});
    for (const [viewport, options] of Object.entries({mobile,desktop})) {
      const totals = [[],[]];
      for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
        for (const version of roundIndex % 2 === 0 ? [0,1] : [1,0]) {
          const measurements = await measure(browser,sites[version].url,options);
          totals[version].push(measurements);
        }
      }
      const results = totals.map(runs => ({
        appLoadedMs:round(median(runs.map(run => run.loadedMs))),
        coldMs:round(median(runs.map(run => run.stats[0].ms))),
        warmMs:round(median(runs.flatMap(run => run.stats.slice(1).map(row => row.ms)))),
        coldLongestFrameMs:round(median(runs.map(run => run.stats[0].longestFrame))),
        warmLongestFrameMs:round(median(runs.flatMap(run => run.stats.slice(1).map(row => row.longestFrame)))),
        warmWorstFrameMs:round(Math.max(...runs.flatMap(run => run.stats.slice(1).map(row => row.longestFrame)))),
      }));
      console.log(JSON.stringify({engine,viewport,baseline:results[0],candidate:results[1]},null,2));
    }
  } finally {
    await browser?.close();
    for (const {server} of sites) server.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
