import { useId } from "react";
import { GraduationCap, Dumbbell, Briefcase, Sparkles, BookOpen, Moon, Library } from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Design tokens                                                          */
/* ---------------------------------------------------------------------- */
export const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

export const COLORS = {
  ink: "#141928",
  panel: "#1D2436",
  panelSoft: "#252D42",
  hair: "#333d57",
  paper: "#F8F4E9",
  paperSoft: "#EFE9D8",
  textLight: "#E9E6DC",
  textMuted: "#9AA3BE",
  textDark: "#211D14",
  School: "#6C93F5",
  Work: "#E8735F",
  Sport: "#57BE8B",
  Extracurricular: "#C69AEE",
  Supercurricular: "#3FB6C4",
  "Independent Study": "#E8A93D",
  Sleep: "#68708A",
};

export const CATEGORY_ICON = {
  School: GraduationCap,
  Work: Briefcase,
  Sport: Dumbbell,
  Extracurricular: Sparkles,
  Supercurricular: Library,
  "Independent Study": BookOpen,
  Sleep: Moon,
};

export const CATEGORY_LABEL = {
  Extracurricular: "External activity",
};

// Categories a user can tick off as completed and see compared in Statistics.
export const TRACKABLE_CATEGORIES = ["Independent Study", "Sport", "Supercurricular"];

// Brand mark: a calendar glyph with a "synced" checkmark accent, in the same
// violet-to-teal gradient used for the upgrade CTA — keeps one consistent
// accent color as the app's visual identity rather than introducing a new one.
export function Logo({ size = 36 }) {
  const gradId = `ss-logo-grad-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7B61FF" />
          <stop offset="1" stopColor="#17D9C4" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill={`url(#${gradId})`} />
      <rect x="8" y="11" width="20" height="17" rx="3" stroke="#fff" strokeWidth="2" />
      <path d="M8 16H28" stroke="#fff" strokeWidth="2" />
      <path d="M13 8V12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 8V12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="21.5" cy="21.5" r="4.5" fill="#fff" />
      <path d="M19.5 21.6L20.9 23L23.5 20" stroke={`url(#${gradId})`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function GlobalStyle() {
  return (
    <style>{`
      @import url('${FONTS_URL}');
      .ss-root * { box-sizing: border-box; }
      .ss-root { font-family: 'Inter', sans-serif; }
      .ss-display { font-family: 'Fraunces', serif; }
      .ss-mono { font-family: 'JetBrains Mono', monospace; }
      .ss-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .ss-scroll::-webkit-scrollbar-thumb { background: #333d57; border-radius: 4px; }
      .ss-input {
        background: #fff; border: 1px solid #DCD5BE; border-radius: 8px;
        padding: 10px 12px; font-family: 'Inter', sans-serif; font-size: 14px;
        color: ${COLORS.textDark}; width: 100%; outline: none;
      }
      .ss-input:focus { border-color: ${COLORS.School}; }
      .ss-btn-primary {
        background: ${COLORS.textDark}; color: ${COLORS.paper}; border: none;
        border-radius: 8px; padding: 11px 20px; font-weight: 600; font-size: 14px;
        cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
        transition: opacity .15s;
      }
      .ss-btn-primary:hover { opacity: .85; }
      .ss-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
      .ss-btn-upgrade {
        background: linear-gradient(135deg, #7B61FF, #17D9C4); color: #fff; border: none;
        border-radius: 8px; padding: 11px 20px; font-weight: 700; font-size: 14px;
        cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 14px rgba(123,97,255,.35);
        transition: transform .15s, box-shadow .15s, opacity .15s;
      }
      .ss-btn-upgrade:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(123,97,255,.5); }
      .ss-btn-upgrade:disabled { opacity: .5; cursor: not-allowed; transform: none; }
      .ss-btn-ghost {
        background: transparent; color: ${COLORS.textDark}; border: 1px solid #DCD5BE;
        border-radius: 8px; padding: 10px 18px; font-weight: 600; font-size: 14px;
        cursor: pointer;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}
