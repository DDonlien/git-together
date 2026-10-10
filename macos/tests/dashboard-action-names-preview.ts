// Isolated production-App interaction test: synthetic account and temporary
// Git only. This never opens the user's current browser tab or App profile.
import { app, BrowserWindow, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { importMiddleware } from '../server/http-api';

async function run() {
  const evidence = dirname(process.argv[1]);
  const profile = await mkdtemp(join(tmpdir(), 'gittogether-action-names-'));
  app.setPath('userData', profile);
  await app.whenReady();
  app.removeAllListeners('window-all-closed'); app.on('window-all-closed', () => {});
  const fixture = await createRemoteServiceFixture('gitea');
  const middleware = importMiddleware(fixture.service); const root = resolve('dist/client');
  const server = createServer((request, response) => {
    void middleware(request, response, () => {
      void (async () => {
        const path = resolve(root, `.${decodeURIComponent(request.url === '/' ? '/index.html' : request.url || '/')}`);
        if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
        response.end(await readFile(path));
      })().catch(() => { response.statusCode = 404; response.end(); });
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const window = new BrowserWindow({ show: false, title: 'GitTogether · 隔离名称提示验证', width: 849, height: 853, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  window.showInactive();
  const evaluate = (source: string) => window.webContents.executeJavaScript(source);
  async function wait(source: string) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) { if (await evaluate(source)) return; await new Promise(done => setTimeout(done, 40)); }
    await writeFile(join(evidence, 'timeout.json'), JSON.stringify({ source, state: await evaluate(`({theme:document.documentElement.dataset.theme, hidden:document.hidden, focus:document.activeElement?.outerHTML, tooltip:document.querySelector('.dashboard-action-name')?.outerHTML, actions:document.querySelectorAll('[data-action-name]').length, text:document.body.innerText.slice(0,2000)})`) }));
    throw new Error(`Isolated UI timed out: ${source}`);
  }
  const first = `document.querySelector('[data-action-name]')`;
  const tooltip = `document.querySelector('.dashboard-action-name')`;
  const hover = (selector: string, x = 600, y = 300, type = 'mouse') => evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:${JSON.stringify(type)},clientX:${x},clientY:${y}}))`);
  try {
    nativeTheme.themeSource = 'light';
    await window.loadURL(`http://127.0.0.1:${address.port}/`);
    await wait(`!!${first}`);
    assert.equal(await evaluate(`document.querySelectorAll('.repository-row-actions [data-action-name]').length`), 8);
    for (const name of ['Commit', 'Fetch', 'Pull', 'Push', 'Get Latest', 'Reconcile', 'Clear', '隐藏']) {
      await hover(`[data-action-name="${name}"]`);
      await wait(`${tooltip}?.textContent === ${JSON.stringify(name)}`);
    }
    await hover('[data-action-name="Get Latest"]', 550, 350);
    await wait(`${tooltip}?.style.left === '562px' && ${tooltip}?.style.top === '366px'`);
    await hover('[data-action-name="Get Latest"]', 560, 360);
    await wait(`${tooltip}?.style.left === '572px' && ${tooltip}?.style.top === '376px'`);
    const before = await evaluate(`document.querySelector('.repository-row-actions').getBoundingClientRect().width`);
    await hover('[data-action-name="Get Latest"]', 848, 852);
    const edge = await evaluate(`(()=>{const t=${tooltip};const b=t.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,w:innerWidth,h:innerHeight,parent:t.parentElement===document.body,pointer:getComputedStyle(t).pointerEvents,bg:getComputedStyle(t).backgroundColor};})()`);
    assert.ok(edge.left >= 8 && edge.top >= 8 && edge.right <= edge.w - 8 && edge.bottom <= edge.h - 8);
    assert.equal(edge.parent, true); assert.equal(edge.pointer, 'none');
    assert.equal(await evaluate(`document.querySelector('.repository-row-actions').getBoundingClientRect().width`), before);
    await writeFile(join(evidence, 'names-light.png'), (await window.webContents.capturePage()).toPNG());
    for (const event of ["window.dispatchEvent(new Event('scroll'))", "window.dispatchEvent(new Event('resize'))", "window.dispatchEvent(new Event('blur'))", `${first}.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}))`, `${first}.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`, `${first}.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))`, `${first}.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))`]) {
      await hover('[data-action-name="Commit"]'); await wait(`${tooltip}?.textContent === 'Commit'`);
      await new Promise(done => setTimeout(done, 50));
      await evaluate(event);
      try { await wait(`!${tooltip}`); } catch (problem) { throw new Error(`Dismissal failed: ${event}`, { cause: problem }); }
    }
    await hover('[data-action-name="Commit"]', 500, 300, 'touch'); await wait(`!${tooltip}`);
    // Inactive QA windows do not emit OS focus events. Exercise React's
    // focusin/out contract directly, without stealing the user's focus.
    await evaluate(`${first}.focus({preventScroll:true}); ${first}.dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`); await wait(`${tooltip}?.textContent === 'Commit'`);
    await hover('[data-action-name="Pull"]'); await wait(`${tooltip}?.textContent === 'Pull' && document.querySelectorAll('.dashboard-action-name').length === 1`);
    await evaluate(`${first}.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`); await wait(`!${tooltip}`);
    await evaluate(`document.querySelector('.repository-disclosure').click()`);
    await wait(`document.querySelectorAll('.repository-row-actions').length > 1`);
    await hover('.dashboard-branch-row [data-action-name="Pull"]'); await wait(`${tooltip}?.textContent === 'Pull'`);
    await hover('[data-action-name="隐藏"]'); await evaluate(`document.querySelector('[data-action-name="隐藏"]').click()`); await wait(`!${tooltip}`);
    await evaluate(`document.querySelector('.dashboard-hidden-toggle').click()`);
    await wait(`!!document.querySelector('[data-action-name="恢复显示"]')`);
    await hover('[data-action-name="恢复显示"]'); await wait(`${tooltip}?.textContent === '恢复显示'`);
    await evaluate(`document.querySelector('[data-action-name="恢复显示"]').click()`); await wait(`!${tooltip}`);
    nativeTheme.themeSource = 'dark'; await wait(`document.documentElement.dataset.theme === 'dark'`);
    await hover('[data-action-name="Clear"]'); await wait(`${tooltip}?.textContent === 'Clear'`);
    const dark = await evaluate(`getComputedStyle(${tooltip}).backgroundColor`); assert.notEqual(dark, edge.bg);
    await writeFile(join(evidence, 'names-dark.png'), (await window.webContents.capturePage()).toPNG());
    assert.equal(await evaluate(`document.querySelectorAll('.git-action-anchor button:not(:disabled)').length`), 0);
    const result = { productionUI: true, syntheticAccount: true, allEightNames: true, branchNames: true, followsPointer: true, edgeAvoidance: true, keyboard: true, dismissal: true, hideRestoreUnchanged: true, lightDark: true, layoutUnchanged: true, gitDisabled: true, gitUnchanged: await fixture.unchanged() };
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result)); console.log(JSON.stringify(result));
  } finally {
    window.destroy(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    await fixture.cleanup(); await rm(profile, { recursive: true, force: true });
  }
}
void run().then(() => app.quit()).catch(problem => { console.error(problem); app.exit(1); });
