export function WindowChrome({ native }: { native: boolean }) {
  return <header className="window-chrome" aria-label="窗口控制">
    <div className="traffic-lights">
      {!native && <>
        <span className="traffic-light traffic-light-close" aria-hidden="true" />
        <span className="traffic-light traffic-light-minimize" aria-hidden="true" />
        <button className="traffic-light traffic-light-fullscreen" type="button" title="切换全屏" aria-label="切换全屏" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }} />
      </>}
    </div>
  </header>;
}
