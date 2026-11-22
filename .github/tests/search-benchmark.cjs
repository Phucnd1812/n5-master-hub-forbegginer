const playwright = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const scope = '/n5-master-hub-forbegginer/';
const engine = process.env.N5_TEST_BROWSER || 'chromium';
const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png',
  '.webmanifest':'application/manifest+json', '.json':'application/json', '.bin':'application/octet-stream'};
const queries = ['na','owaranai','tabesasenai','ikanakerebanaranai','nondekara','tabetakotogaaru','không được làm','muốn làm',
  'nihongoo','学校','ﾃﾚﾋﾞ','高くなかった','飲まなければならない','食べられる','昨日、友達と映画を見てから、ご飯を食べました。',
  '天体物理学ではブラックホールを研究します。','owa','taberarenakatta','ikanakerebanarimasen','benkyoushiteimasu',
  'không cần phải','vừa nghe nhạc vừa học','薬を飲んでから寝なければなりません。','申込みました','毎日、日本語を勉強するます。'];
const desktop = {viewport:{width:1280,height:800}};
const mobile = {viewport:{width:390,height:844}, isMobile:true, hasTouch:true};
const median = values => {
  const sorted = values.slice().sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
};
const round = value => Math.round(value * 10) / 10;
const p95 = values => values.slice().sort((a,b) => a-b)[Math.ceil(values.length * .95) - 1];
const average = values => values.reduce((sum,value) => sum + value,0) / values.length;

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
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {server, url:'http://localhost:' + server.address().port + scope};
}

async function measure(browser, url, options, effectsMode) {
  const context = await browser.newContext({...options,serviceWorkers:'block'});
  try {
    await context.addInitScript(effectsMode => {
      if (effectsMode) localStorage.setItem('n5_effects_mode_v1',effectsMode);
      if (window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
        const longTasks = [];
        const record = entries => entries.forEach(({startTime,duration}) => longTasks.push({startTime,duration}));
        const observer = new PerformanceObserver(list => record(list.getEntries()));
        observer.observe({type:'longtask',buffered:true});
        window.n5BenchmarkLongTasks = () => {
          record(observer.takeRecords());
          return longTasks;
        };
      }
    },effectsMode);
    await context.route('**/*',route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    let cdp;
    if (engine === 'chromium') {
      cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await cdp.send('Performance.enable');
    }
    await page.goto(url,{waitUntil:'load'});
    await page.locator('.dashboard-hero').waitFor();
    const result = await page.evaluate(async ({queries,url}) => {
      const input = document.getElementById('globalSearchInput');
      const content = document.getElementById('mainContainer');
      const ready = '[data-lookup-state="ready"], #mainContainer .n5-smart-panel';
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').filter(entry => entry.name.startsWith(url));
      const bodyBytes = [navigation,...resources].reduce((size,entry) => size + entry.decodedBodySize,0);
      const started = performance.now();
      const stats = [];
      for (const query of queries) {
        const start = performance.now();
        let last = start;
        let longestFrame = 0;
        let renderedAt;
        const hasResults = () => content.querySelector('h1')?.textContent === 'Kết quả cho “' + query + '”' &&
          content.querySelector(ready);
        const observer = new MutationObserver(() => {
          if (renderedAt === undefined && hasResults()) renderedAt = performance.now();
        });
        observer.observe(content,{childList:true,subtree:true});
        input.value = query;
        input.dispatchEvent(new InputEvent('input',{bubbles:true}));
        await new Promise((resolve,reject) => {
          const poll = () => {
            const now = performance.now();
            longestFrame = Math.max(longestFrame,now-last);
            last = now;
            if (hasResults()) {
              observer.disconnect();
              stats.push({query,ms:now-start,domMs:(renderedAt ?? now)-start,longestFrame});
              resolve();
            } else if (now - start > 15_000) {
              observer.disconnect();
              reject(new Error('Timed out waiting for lookup ' + query));
            } else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        });
      }
      const longTasks = window.n5BenchmarkLongTasks?.();
      return {
        stats,loadedMs:navigation.domContentLoadedEventEnd,bodyBytes,shellBytes:navigation.decodedBodySize,
        effect:document.documentElement.dataset.n5Effects || 'legacy',
        longTasks:longTasks ? {
          startup:longTasks.filter(entry => entry.startTime < started),
          lookup:longTasks.filter(entry => entry.startTime >= started),
        } : null,
      };
    },{queries,url});
    if (cdp) {
      const {metrics} = await cdp.send('Performance.getMetrics');
      result.rendererJsHeapBytes = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value;
    }
    if (effectsMode && effectsMode !== 'auto' && result.effect !== effectsMode) {
      throw new Error('Expected effects mode ' + effectsMode + ', found ' + result.effect);
    }
    return result;
  } finally {
    await context.close();
  }
}

function summarize(runs) {
  const warm = runs.flatMap(run => run.stats.slice(1));
  const worst = warm.reduce((a,b) => a.longestFrame > b.longestFrame ? a : b);
  const taskSummary = phase => {
    const entries = runs.flatMap(run => run.longTasks[phase]);
    return {
      perRun:round(entries.length / runs.length),
      msPerRun:round(entries.reduce((sum,entry) => sum + entry.duration,0) / runs.length),
      maxMs:round(Math.max(0,...entries.map(entry => entry.duration))),
    };
  };
  const heap = runs.map(run => run.rendererJsHeapBytes).filter(Number.isFinite);
  return {
    resolvedEffects:[...new Set(runs.map(run => run.effect))],
    appLoadedMs:round(median(runs.map(run => run.loadedMs))),
    coldMs:round(median(runs.map(run => run.stats[0].ms))),
    coldDomMs:round(median(runs.map(run => run.stats[0].domMs))),
    warmMs:round(median(warm.map(row => row.ms))),
    warmP95Ms:round(p95(warm.map(row => row.ms))),
    coldLongestFrameMs:round(median(runs.map(run => run.stats[0].longestFrame))),
    warmLongestFrameMs:round(median(warm.map(row => row.longestFrame))),
    warmWorstFrameMs:round(worst.longestFrame),
    warmWorstQuery:worst.query,
    shellBytes:Math.round(average(runs.map(run => run.shellBytes))),
    startupBodyBytes:Math.round(average(runs.map(run => run.bodyBytes))),
    rendererJsHeapMiB:heap.length ? round(median(heap) / 1024 ** 2) : null,
    longTasks:runs.every(run => run.longTasks) ? {
      startup:taskSummary('startup'),
      lookup:taskSummary('lookup'),
    } : null,
  };
}

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node search-benchmark.cjs /absolute/path/to/baseline [candidate-root]');
  const base = path.resolve(process.argv[2]);
  const candidate = path.resolve(process.argv[3] || path.join(__dirname,'../..'));
  const sites = await Promise.all([serve(base),serve(candidate)]);
  const rounds = Number(process.env.N5_BENCH_ROUNDS || 3);
  const variants = [
    {label:'baseline',site:sites[0]},
    {label:'candidate',site:sites[1],mode:'auto'},
    {label:'fullEffects',site:sites[1],mode:'full'},
    {label:'performanceEffects',site:sites[1],mode:'performance'},
  ];
  let browser;
  try {
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 12) throw new Error('N5_BENCH_ROUNDS must be 1–12');
    browser = await playwright[engine].launch({executablePath:process.env.N5_TEST_BROWSER_PATH || undefined});
    for (const [viewport, options] of Object.entries({mobile,desktop})) {
      const totals = Object.fromEntries(variants.map(({label}) => [label,[]]));
      for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
        const offset = roundIndex % variants.length;
        const order = [...variants.slice(offset),...variants.slice(0,offset)];
        for (const {label,site,mode} of order) {
          totals[label].push(await measure(browser,site.url,options,mode));
        }
      }
      const results = Object.fromEntries(Object.entries(totals).map(([label,runs]) => [label,summarize(runs)]));
      console.log(JSON.stringify({engine,viewport,rounds,queryCount:queries.length,...results},null,2));
    }
  } finally {
    await browser?.close();
    for (const {server} of sites) server.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
