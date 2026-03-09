const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.resolve('output', 'qa-live');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const logs = [];
  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: String(err && err.message || err) });
  });

  const fileUrl = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);

  // Home
  await page.waitForSelector('#btn-practice');
  await page.screenshot({ path: path.join(outDir, 'home.png') });

  // Practice: open and check button fire
  await page.click('#btn-practice');
  await page.waitForSelector('#btn-check');
  await page.click('#btn-check');
  await page.waitForTimeout(1200);
  const practiceVerdict = await page.locator('#verdict-display').innerText();

  // JSON buttons
  let downloadCount = 0;
  page.on('download', async (d) => {
    downloadCount += 1;
    const savePath = path.join(outDir, d.suggestedFilename());
    try { await d.saveAs(savePath); } catch (_) {}
  });
  await page.click('#btn-export-json');
  await page.waitForTimeout(300);
  await page.click('#btn-export-studxp-json');
  await page.waitForTimeout(300);

  // Test: start and run one check
  await page.click('#btn-back-practice');
  await page.waitForSelector('#btn-test');
  await page.click('#btn-test');
  await page.waitForSelector('#test-start-btn');
  await page.click('#test-start-btn');
  await page.waitForSelector('#test-check-btn');

  // Draw short stroke on test canvas so grading runs
  const canvas = page.locator('#test-draw-canvas');
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 8 });
    await page.mouse.up();
  }

  await page.click('#test-check-btn');
  await page.waitForTimeout(1500);
  const testVerdict = await page.locator('#test-verdict').innerText();

  // History open
  await page.click('#btn-back-test');
  await page.waitForSelector('#btn-history');
  await page.click('#btn-history');
  await page.waitForSelector('#history-list');
  await page.waitForTimeout(500);
  const historyCount = await page.locator('#history-list .history-item').count();

  await page.screenshot({ path: path.join(outDir, 'final.png') });

  const severe = logs.filter(l => l.type === 'error' || l.type === 'pageerror');
  const result = {
    timestamp: new Date().toISOString(),
    practiceVerdict,
    testVerdict,
    historyCount,
    downloadCount,
    severeErrors: severe,
    sampleLogs: logs.slice(0, 80)
  };
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8');

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
