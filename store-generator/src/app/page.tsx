"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";

/* ============ 主题 ============ */
const BLUE = "#2563eb";
const PURPLE = "#7c3aed";
const INK = "#0f172a";
const SUB = "#475569";
const SUB_DARK = "#94a3b8";

const FONT =
  '"Noto Sans SC", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

/* ============ SVG 图标（零 emoji） ============ */
type IconName =
  | "check"
  | "shield"
  | "lock"
  | "code"
  | "trash"
  | "clock"
  | "calendar"
  | "share"
  | "search"
  | "download"
  | "folder"
  | "star"
  | "image";

function Icon({ name, size = 22, color = BLUE }: { name: IconName; size?: number; color?: string }) {
  const p: Record<IconName, React.ReactNode> = {
    check: <polyline points="20 6 9 17 4 12" />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    code: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
    trash: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.7" y2="16.7" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {p[name]}
    </svg>
  );
}

/* ============ 小徽章（SVG + 文字，替代 emoji 胶囊） ============ */
function Pill({ icon, text, dark = false }: { icon: IconName; text: string; dark?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 22px",
        borderRadius: 999,
        border: dark ? "1px solid rgba(255,255,255,.22)" : `1px solid rgba(37,99,235,.35)`,
        background: dark ? "rgba(255,255,255,.06)" : "rgba(37,99,235,.07)",
        color: dark ? "#e2e8f0" : "#1e40af",
        fontSize: 21,
        fontWeight: 500,
        fontFamily: FONT,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={icon} size={22} color={dark ? "#93c5fd" : BLUE} />
      {text}
    </div>
  );
}

/* ============ 顶部品牌行 ============ */
function BrandRow({ dark = false, size = 44 }: { dark?: boolean; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.png"
        alt="logo"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 10 }}
      />
      <span
        style={{
          fontSize: size >= 60 ? 30 : 24,
          fontWeight: 700,
          color: dark ? "#fff" : INK,
          fontFamily: FONT,
        }}
      >
        书签清理助手
      </span>
    </div>
  );
}

/* ============ 悬浮截图 ============ */
function Shot({ src, width, rotate = 0 }: { src: string; width: number; rotate?: number }) {
  return (
    <div
      style={{
        width,
        transform: `rotate(${rotate}deg)`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 48px 96px rgba(2,6,23,.38), 0 12px 32px rgba(2,6,23,.22)",
        border: "1px solid rgba(255,255,255,.14)",
        background: "#fff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ display: "block", width: "100%" }} />
    </div>
  );
}

/* ============ S1 Hero · 浅底 · 文左图右 ============ */
function SlideHero() {
  return (
    <div style={{ width: 1280, height: 800, background: "#eef4ff", fontFamily: FONT, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 72px", gap: 48 }}>
      <div
        style={{
          position: "absolute",
          right: -180,
          top: -180,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,.16) 0%, rgba(37,99,235,0) 68%)",
        }}
      />
      <div style={{ width: 460, display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
        <BrandRow />
        <div
          style={{
            alignSelf: "flex-start",
            padding: "8px 18px",
            borderRadius: 8,
            background: "rgba(37,99,235,.1)",
            color: "#1d4ed8",
            fontSize: 19,
            fontWeight: 700,
          }}
        >
          免费开源
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: INK, lineHeight: 1.18, letterSpacing: "-.01em" }}>
          失效书签，
          <br />
          <span style={{ color: BLUE }}>一眼找齐</span>
        </div>
        <div style={{ fontSize: 25, color: SUB, lineHeight: 1.65 }}>
          扫描失效、重复、空文件夹与搬家链接，
          <br />
          自动分类，逐条给出原因。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 6 }}>
          {[
            "404 / 超时 / 网络错误自动识别",
            "URL 归一化查重，忽略跟踪参数",
            "域名迁移检测，一键更新旧地址",
          ].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 21, color: "#334155" }}>
              <Icon name="check" size={24} />
              {t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
        <Shot src="/screenshots/01-cleanup.png" width={640} />
      </div>
    </div>
  );
}

/* ============ S2 安全 · 暗底 · 文右图左 ============ */
function SlideSafety() {
  return (
    <div style={{ width: 1280, height: 800, background: "#0b1220", fontFamily: FONT, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 72px", gap: 48 }}>
      <div
        style={{
          position: "absolute",
          left: -200,
          bottom: -220,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,.28) 0%, rgba(37,99,235,0) 66%)",
        }}
      />
      <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
        <Shot src="/screenshots/05-settings.png" width={620} />
      </div>
      <div style={{ width: 480, display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
        <BrandRow dark />
        <div style={{ fontSize: 72, fontWeight: 900, color: "#fff", lineHeight: 1.18 }}>
          删错了？
          <br />
          <span style={{ color: "#60a5fa" }}>随时撤销</span>
        </div>
        <div style={{ fontSize: 25, color: SUB_DARK, lineHeight: 1.65 }}>
          回收站暂存每一次删除，
          <br />
          完整备份一键回滚。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          <Pill icon="trash" text="回收站暂存全部删除" dark />
          <Pill icon="clock" text="操作日志，逐步撤销" dark />
          <Pill icon="download" text="备份导出 · 一键回灌" dark />
        </div>
      </div>
    </div>
  );
}

/* ============ S3 画像 · 中性底 · 文上图居中 ============ */
function SlidePortrait() {
  return (
    <div style={{ width: 1280, height: 800, background: "#e8edf4", fontFamily: FONT, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 64px 0" }}>
      <div
        style={{
          position: "absolute",
          left: -160,
          top: -160,
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,.12) 0%, rgba(124,58,237,0) 68%)",
        }}
      />
      <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 14, position: "relative", marginLeft: 16 }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: INK, lineHeight: 1.2 }}>
          你的书签，<span style={{ color: PURPLE }}>一目了然</span>
        </div>
        <div style={{ fontSize: 24, color: SUB }}>
          新增趋势 · 死链率 · 年份分布 · Top 网站，全部图表化
        </div>
      </div>
      <div style={{ marginTop: 40, position: "relative" }}>
        <Shot src="/screenshots/02-portrait.png" width={980} />
      </div>
    </div>
  );
}

/* ============ S4 整理+分享 · 紫粉渐变 · 文左图右 ============ */
function SlideShare() {
  return (
    <div style={{ width: 1280, height: 800, background: "linear-gradient(135deg, #0f0a2e 0%, #2e1065 55%, #4c1d95 100%)", fontFamily: FONT, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 72px", gap: 48 }}>
      <div
        style={{
          position: "absolute",
          right: -160,
          bottom: -200,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,.38) 0%, rgba(124,58,237,0) 66%)",
        }}
      />
      <div style={{ width: 470, display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
        <BrandRow dark />
        <div style={{ fontSize: 64, fontWeight: 900, color: "#fff", lineHeight: 1.22 }}>
          书签理顺了，
          <br />
          <span style={{ color: "#a5b4fc" }}>还能这么美</span>
        </div>
        <div style={{ fontSize: 25, color: "#a5b4fc", lineHeight: 1.65 }}>
          批量归档与整理，精选书签
          <br />
          生成分享页与长图海报。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          <Pill icon="folder" text="批量归档 · 标题清理" dark />
          <Pill icon="star" text="精选书签集" dark />
          <Pill icon="image" text="长图海报 · 四种主题" dark />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
        <Shot src="/screenshots/04-share.png" width={620} />
      </div>
    </div>
  );
}

/* ============ S5 隐私 · 白底 · 居中图形 ============ */
function SlideTrust() {
  const cards = [
    { icon: "shield" as IconName, t: "本地运行", d: "所有操作在浏览器内完成" },
    { icon: "lock" as IconName, t: "零上传", d: "书签数据不出你的设备" },
    { icon: "code" as IconName, t: "开源 MIT", d: "代码公开，可自行审计" },
  ];
  return (
    <div style={{ width: 1280, height: 800, background: "#ffffff", fontFamily: FONT, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
      <div
        style={{
          position: "absolute",
          top: -220,
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(37,99,235,.08) 0%, rgba(37,99,235,0) 70%)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="logo" style={{ width: 88, height: 88, borderRadius: 20, position: "relative" }} />
      <div style={{ fontSize: 60, fontWeight: 900, color: INK, position: "relative" }}>
        你的书签，<span style={{ color: BLUE }}>只属于你</span>
      </div>
      <div style={{ fontSize: 26, color: "#64748b", position: "relative" }}>
        全程本地运行，零上传，零追踪
      </div>
      <div style={{ display: "flex", gap: 28, marginTop: 12, position: "relative" }}>
        {cards.map((c) => (
          <div
            key={c.t}
            style={{
              width: 300,
              padding: "34px 28px",
              borderRadius: 20,
              border: "1px solid #e2e8f0",
              background: "#fff",
              boxShadow: "0 18px 44px rgba(15,23,42,.07)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Icon name={c.icon} size={42} />
            <div style={{ fontSize: 26, fontWeight: 700, color: INK }}>{c.t}</div>
            <div style={{ fontSize: 18, color: "#64748b" }}>{c.d}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 18, color: "#94a3b8", position: "relative" }}>
        无账号 · 无分析 · 无广告 · 无第三方代码
      </div>
    </div>
  );
}

/* ============ Promo Small 440x280 ============ */
function PromoSmall() {
  return (
    <div
      style={{
        width: 440,
        height: 280,
        background: "linear-gradient(135deg, #1d4ed8 0%, #0b1220 100%)",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -70,
          right: -70,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,.35) 0%, rgba(96,165,250,0) 70%)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="logo" style={{ width: 60, height: 60, borderRadius: 14, position: "relative" }} />
      <div style={{ fontSize: 38, fontWeight: 900, color: "#fff", position: "relative", letterSpacing: ".02em" }}>
        失效书签，一键清理
      </div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,.78)", position: "relative", letterSpacing: ".12em" }}>
        失效 · 重复 · 空文件夹 · 全程本地
      </div>
    </div>
  );
}

/* ============ Promo Marquee 1400x560 ============ */
function PromoMarquee() {
  return (
    <div
      style={{
        width: 1400,
        height: 560,
        background: "linear-gradient(120deg, #1d4ed8 0%, #1e3a8a 55%, #0b1220 100%)",
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        padding: "0 88px",
        gap: 64,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -180,
          top: -180,
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,.3) 0%, rgba(96,165,250,0) 68%)",
        }}
      />
      <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
        <BrandRow dark size={56} />
        <div style={{ fontSize: 68, fontWeight: 900, color: "#fff", lineHeight: 1.25 }}>
          失效书签，
          <br />
          一键清理
        </div>
        <div style={{ fontSize: 23, color: "rgba(255,255,255,.82)", lineHeight: 1.7 }}>
          回收站可撤销 · 每周自动备份
          <br />
          书签画像 · 时光机 · 全程本地
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
        <Shot src="/screenshots/01-cleanup.png" width={600} />
      </div>
    </div>
  );
}

/* ============ 导出逻辑（离屏克隆，精确像素） ============ */
async function exportNode(
  node: HTMLElement,
  filename: string,
  w: number,
  h: number
) {
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;`;
  const clone = node.cloneNode(true) as HTMLElement;
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const dataUrl = await toPng(clone, {
      width: w,
      height: h,
      pixelRatio: 1,
      canvasWidth: w,
      canvasHeight: h,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  } finally {
    holder.remove();
  }
}

/* ============ 页面 ============ */
const CANVASES: {
  id: string;
  label: string;
  file: string;
  w: number;
  h: number;
  Comp: () => JSX.Element;
}[] = [
  { id: "s1", label: "S1 Hero · 失效书签一眼找齐", file: "01_hero.png", w: 1280, h: 800, Comp: SlideHero },
  { id: "s2", label: "S2 安全 · 删错随时撤销", file: "02_safety.png", w: 1280, h: 800, Comp: SlideSafety },
  { id: "s3", label: "S3 画像 · 收藏一目了然", file: "03_portrait.png", w: 1280, h: 800, Comp: SlidePortrait },
  { id: "s4", label: "S4 整理 + 分享 · 还能这么美", file: "04_share.png", w: 1280, h: 800, Comp: SlideShare },
  { id: "s5", label: "S5 隐私 · 只属于你", file: "05_trust.png", w: 1280, h: 800, Comp: SlideTrust },
  { id: "ps", label: "Promo Small 440×280", file: "promo-small-440x280.png", w: 440, h: 280, Comp: PromoSmall },
  { id: "pm", label: "Promo Marquee 1400×560", file: "promo-marquee-1400x560.png", w: 1400, h: 560, Comp: PromoMarquee },
];

export default function Page() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.3);

  const doExport = async (c: (typeof CANVASES)[number]) => {
    const node = refs.current[c.id];
    if (!node) return;
    setBusy(c.id);
    try {
      await exportNode(node, c.file, c.w, c.h);
    } catch (e) {
      console.error(e);
      alert(`导出失败: ${c.file}\n${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    for (const c of CANVASES) {
      await doExport(c);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <main style={{ fontFamily: FONT, background: "#f1f5f9", minHeight: "100vh", padding: "28px 40px 80px" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0f172a",
          color: "#fff",
          borderRadius: 14,
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>商店素材生成器</div>
        <div style={{ color: "#94a3b8", fontSize: 14, flex: 1 }}>
          逐张检查 → 点击导出 PNG（精确像素，文件名即商店目标）
        </div>
        <label style={{ fontSize: 13, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
          预览缩放
          <input
            type="range"
            min={0.2}
            max={0.6}
            step={0.05}
            value={previewScale}
            onChange={(e) => setPreviewScale(Number(e.target.value))}
          />
        </label>
        <button
          onClick={exportAll}
          disabled={busy !== null}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 22px",
            fontSize: 15,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? `导出中…` : "导出全部 7 张"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {CANVASES.map((c) => (
          <section key={c.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 700, color: INK }}>{c.label}</span>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {c.w}×{c.h} → {c.file}
              </span>
              <button
                onClick={() => doExport(c)}
                disabled={busy !== null}
                style={{
                  marginLeft: "auto",
                  background: busy === c.id ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {busy === c.id ? "导出中…" : "导出"}
              </button>
            </div>
            <div
              style={{
                width: c.w * previewScale,
                height: c.h * previewScale,
                overflow: "hidden",
                borderRadius: 8,
                boxShadow: "0 8px 30px rgba(15,23,42,.14)",
              }}
            >
              <div
                ref={(el) => {
                  refs.current[c.id] = el;
                }}
                style={{
                  width: c.w,
                  height: c.h,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <c.Comp />
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
