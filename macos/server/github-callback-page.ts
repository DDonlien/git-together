/** Callback feedback only: this page never exchanges a code or receives a token. */
export const callbackStyles = `
  .oauth-card{padding:28px}.oauth-progress{display:flex;align-items:flex-start;gap:18px}
  .oauth-symbol{display:grid;place-items:center;flex:none;width:36px;height:36px;margin-top:2px;color:light-dark(#0670e9,#7ab6ff)}
  .oauth-spinner{box-sizing:border-box;width:30px;height:30px;border:2px solid light-dark(#d6e4f5,#405366);border-top-color:currentColor;border-radius:50%;animation:oauth-turn .9s linear infinite}
  .oauth-result-icon{display:none;width:30px;height:30px}.oauth-copy{min-width:0;flex:1}
  .oauth-copy h2{font-size:16px;font-weight:600;line-height:1.5;margin:0 0 6px}.oauth-copy p{margin:0;overflow-wrap:anywhere}
  .oauth-meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:24px;font-size:12px;color:light-dark(#747780,#a1a8ad);font-variant-numeric:tabular-nums}
  .oauth-slow{margin:16px 0 0;font-size:13px;color:light-dark(#8c601c,#d5b87d)}
  .oauth-card .actions{margin-top:24px}.oauth-card .button{display:inline-flex;min-height:20px;align-items:center}
  [data-status=complete] .oauth-symbol{color:light-dark(#208153,#85cda5)}
  [data-status=failed] .oauth-symbol,[data-status=unknown] .oauth-symbol{color:light-dark(#b12d26,#ff8c84)}
  [data-status=complete] .oauth-complete,[data-status=failed] .oauth-failed,[data-status=unknown] .oauth-failed{display:block}
  [data-status=complete] .oauth-spinner,[data-status=failed] .oauth-spinner,[data-status=unknown] .oauth-spinner{display:none;animation:none}
  @keyframes oauth-turn{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){.oauth-spinner{animation:none}}
  @media(max-width:420px){.oauth-card{padding:22px}.oauth-progress{gap:14px}.oauth-meta{flex-direction:column;gap:6px}}
`;

export function callbackContent(previewOrigin: string | null): string {
  return `<section class="oauth-card" aria-label="GitHub 授权进度">
    <div class="oauth-progress"><div class="oauth-symbol" aria-hidden="true"><span class="oauth-spinner"></span>
      <svg class="oauth-result-icon oauth-complete" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.5"/><path d="m10 16 4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <svg class="oauth-result-icon oauth-failed" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.5"/><path d="M16 9v8m0 5v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </div><div class="oauth-copy"><h2 id="oauth-status" role="status" aria-live="polite" aria-atomic="true">正在交换授权结果</h2><p id="oauth-detail">GitHub 已返回，正在安全地完成连接。请稍候…</p></div></div>
    <div class="oauth-meta"><span id="oauth-elapsed" aria-live="off">已等待 0 秒</span><span id="oauth-heartbeat" aria-live="off">正在查询授权状态…</span></div>
    <p id="oauth-slow" class="oauth-slow" role="status" hidden>这一步比平时久，仍在等待结果。请保持窗口打开；如果失败，会在这里显示原因。</p>
    <noscript><p>此页需要 JavaScript 才能更新进度。请返回 GitTogether 查看账号连接结果。</p></noscript>
    ${previewOrigin ? `<div class="actions"><a class="button" href="${previewOrigin}/">返回 GitTogether</a></div>` : '<p>完成后将自动返回 GitTogether，你可以关闭此页。</p>'}
  </section>`;
}

export function callbackScript(sessionId: string): string {
  return `
    history.replaceState(null,'','/oauth/github/callback');
    document.documentElement.setAttribute('data-status','pending');
    const status=document.getElementById('oauth-status'),title=document.getElementById('page-title'),detail=document.getElementById('oauth-detail');
    const elapsed=document.getElementById('oauth-elapsed'),heartbeat=document.getElementById('oauth-heartbeat'),slow=document.getElementById('oauth-slow');
    const phases={
      waiting:['等待 GitHub 返回','请在 GitHub 页面完成登录和授权。'],
      exchanging:['正在交换授权结果','正在等待 GitHub 确认授权，尚未添加账号。'],
      verifying:['正在核对 GitHub 账号','授权结果已收到，正在确认身份和账号连接。'],
      importing:['正在导入账号与仓库','正在读取可访问的仓库，并更新 GitTogether。仓库较多时可能需要更久。']
    };
    const started=performance.now();let phase='exchanging',phaseStarted=started,lastUpdate=null,ended=false,pollTimer;
    function seconds(since){return Math.max(0,Math.floor((performance.now()-since)/1000));}
    function tick(){
      elapsed.textContent='已等待 '+seconds(started)+' 秒';
      if(lastUpdate!==null){const age=seconds(lastUpdate);heartbeat.textContent=age<2?'状态刚刚更新':'状态更新于 '+age+' 秒前';}
      slow.hidden=seconds(phaseStarted)<15;
    }
    const clock=setInterval(tick,1000);
    function finish(result,message){
      ended=true;clearInterval(clock);clearTimeout(pollTimer);slow.hidden=true;
      document.documentElement.setAttribute('data-status',result);
      document.title=result==='complete'?'GitHub 授权完成':result==='unknown'?'暂时无法确认授权结果':'GitHub 授权未完成';title.textContent=document.title;
      status.textContent=result==='complete'?'账号已连接':result==='unknown'?'授权状态读取中断':'授权未完成';detail.textContent=message;
      elapsed.textContent=(result==='complete'?'用时 ':'已等待 ')+seconds(started)+' 秒';heartbeat.textContent=result==='complete'?'已完成':result==='unknown'?'结果尚未确认':'已停止';
      if(result==='complete')window.close();
    }
    async function poll(){try{
      const response=await fetch('/api/callback-status',{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json','X-GitTogether-Client':'1'},body:JSON.stringify({sessionId:${JSON.stringify(sessionId)}}),signal:AbortSignal.timeout(15000)});
      const envelope=await response.json();
      if(ended)return;
      if(!response.ok||!envelope.ok){finish('failed',envelope.error||'网页授权状态无效，请返回 GitTogether 查看连接结果。');return;}
      const value=envelope.value;
      if(value&&value.status==='complete'){finish('complete','账号和仓库已更新到 GitTogether。你可以关闭这个窗口。');return;}
      if(!value||value.status!=='pending'||typeof value.phase!=='string'||!Object.hasOwn(phases,value.phase))throw new Error('Invalid callback status');
      lastUpdate=performance.now();
      if(phase!==value.phase){phase=value.phase;phaseStarted=lastUpdate;}
      const copy=phases[phase];if(status.textContent!==copy[0])status.textContent=copy[0];detail.textContent=copy[1];tick();
      pollTimer=setTimeout(poll,500);
    }catch{
      if(!ended)finish('unknown','无法读取本机授权状态。后台可能仍在处理，请返回 GitTogether 查看账号；不要重复提交这次回调。');
    }}
    poll();
  `;
}
