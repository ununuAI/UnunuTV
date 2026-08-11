"use client";

import {
  Boxes,
  Clapperboard,
  Eye,
  EyeOff,
  Folder,
  Grid2X2,
  History,
  House,
  Map,
  Maximize2,
  Moon,
  PanelBottom,
  Plus,
  Scan,
  Settings,
  Sun,
  Workflow
} from "lucide-react";

function ChromeButton({ active = false, className = "", disabled = false, icon: Icon, label, onClick }) {
  return <button aria-label={label} aria-pressed={active} className={`${className}${active ? " is-active" : ""}`} disabled={disabled} onClick={onClick} title={disabled ? "全自动运行期间只读" : label} type="button"><Icon size={18} strokeWidth={1.8} /></button>;
}

export function MomoCanvasChrome({
  activePanel,
  canMutate,
  light,
  onAdd,
  onAssets,
  onFit,
  onFullscreen,
  onHistory,
  onHome,
  onMiniMap,
  onPlayer,
  onSettings,
  onTheme,
  onTimeline,
  onToolbox,
  onToggleConnections,
  onWorkflow,
  onZoom,
  playerOpen,
  showMiniMap,
  showConnections,
  timelineOpen,
  zoom
}) {
  return <div className="momo-canvas-chrome" aria-label="Ununu 画布控制底座">
    <nav className="momo-side-toolbar" aria-label="画布主工具栏">
      <ChromeButton className="momo-side-add" disabled={!canMutate} icon={Plus} label="添加节点" onClick={onAdd} />
      <ChromeButton active={activePanel === "assets"} icon={Folder} label="资产库" onClick={onAssets} />
      <ChromeButton active={activePanel === "assetManager"} icon={Workflow} label="工作流与节点" onClick={onWorkflow} />
      <ChromeButton active={activePanel === "history"} icon={History} label="素材历史" onClick={onHistory} />
      <ChromeButton active={activePanel === "toolbox"} icon={Grid2X2} label="画布工具" onClick={onToolbox} />
      <span className="momo-side-divider" />
      <ChromeButton className="momo-side-home" icon={House} label="返回项目主页" onClick={onHome} />
    </nav>

    <nav className="momo-bottom-controls" aria-label="画布显示与工作区控制">
      <div className="momo-control-group">
        <ChromeButton active={showConnections} icon={showConnections ? Eye : EyeOff} label="显示或隐藏连线" onClick={onToggleConnections} />
        <ChromeButton active={showMiniMap} icon={Map} label="画布小地图" onClick={onMiniMap} />
      </div>
      <span className="momo-control-divider" />
      <div className="momo-control-group momo-zoom-group">
        <ChromeButton icon={Scan} label="适应窗口" onClick={onFit} />
        <input aria-label={`画布缩放 ${zoom}%`} max="200" min="10" onChange={(event) => onZoom(Number(event.target.value))} step="1" type="range" value={Math.max(10, Math.min(200, zoom))} />
      </div>
      <span className="momo-control-divider" />
      <div className="momo-control-group">
        <ChromeButton active={timelineOpen} icon={PanelBottom} label="时间线面板" onClick={onTimeline} />
        <ChromeButton active={playerOpen} icon={Clapperboard} label="播放器面板" onClick={onPlayer} />
        <ChromeButton active={activePanel === "assets"} icon={Boxes} label="快捷资产" onClick={onAssets} />
        <ChromeButton active={activePanel === "settings"} icon={Settings} label="项目与 Provider 设置" onClick={onSettings} />
        <ChromeButton icon={light ? Moon : Sun} label={light ? "切换黑色主题" : "切换白色主题"} onClick={onTheme} />
        <ChromeButton icon={Maximize2} label="全屏" onClick={onFullscreen} />
      </div>
    </nav>
  </div>;
}
