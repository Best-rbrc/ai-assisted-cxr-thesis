import { useState } from "react";
import { Languages, Copy, Check, Brain } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import type { Language } from "@/context/study-types";
import FindingsReference from "@/components/FindingsReference";
import CheXIcon from "@/components/CheXIcon";

interface SystemHeaderProps {
  breadcrumb?: string;
  rightContent?: React.ReactNode;
  progress?: number;
  phaseLabel?: string;
  showFindingsButton?: boolean;
}

const SystemHeader = ({ breadcrumb, rightContent, progress, phaseLabel, showFindingsButton }: SystemHeaderProps) => {
  const { language, setLanguage, sessionCode, screen, setScreen } = useStudy();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFindings, setShowFindings] = useState(false);

  const studyScreens = ["tutorial", "baseline", "trial", "block-break", "bonus-offer", "debrief", "pre-survey"];

  const copyCode = () => {
    if (!sessionCode) return;
    navigator.clipboard.writeText(sessionCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogoClick = () => {
    const activeScreens = ["welcome", "consent", "interface-tutorial", "baseline", "pre-survey", "tutorial", "trial", "block-break", "bonus-offer", "debrief"];
    if (activeScreens.includes(screen)) {
      setShowConfirm(true);
    } else {
      setScreen("landing");
    }
  };

  const confirmExit = () => {
    setShowConfirm(false);
    setScreen("landing");
  };

  return (
    <>
      <header className="h-12 border-b border-border bg-card/50 px-4 flex items-center justify-between shrink-0 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleLogoClick} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
            <CheXIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground tracking-tight">CheXStudy</span>
          </button>
          {breadcrumb && (
            <>
              <span className="text-muted-foreground/40 text-sm hidden sm:inline">/</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">{breadcrumb}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {(studyScreens.includes(screen) || showFindingsButton) && (
            <button
              onClick={() => setShowFindings(true)}
              title={language === "en" ? "Findings Reference" : "Befund-Referenz"}
              className="flex items-center gap-1 px-2 h-7 rounded bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Brain className={`w-3.5 h-3.5 ${(screen === "tutorial" || (screen === "interface-tutorial" && showFindingsButton)) ? "animate-bounce" : ""}`} />
              <span className="hidden sm:inline">{language === "en" ? "Findings" : "Befunde"}</span>
            </button>
          )}
          {phaseLabel && (
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest hidden sm:inline">{phaseLabel}</span>
          )}
          {progress !== undefined && (
            <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(progress, 2)}%` }} />
            </div>
          )}
          {rightContent}
          {sessionCode && (
            <button
              onClick={copyCode}
              title={language === "en" ? "Copy your session code" : "Sitzungscode kopieren"}
              className="flex items-center gap-1 px-2 h-7 rounded bg-secondary/80 text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground transition-colors tracking-wider"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {sessionCode}
            </button>
          )}
          <button
            onClick={() => setLanguage(language === "en" ? "de" : "en")}
            className="flex items-center gap-1 px-2.5 h-7 rounded bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Languages className="w-3.5 h-3.5" />
            {language === "en" ? "DE" : "EN"}
          </button>
        </div>
      </header>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-foreground">
              {language === "en" ? "Leave the study?" : "Studie verlassen?"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {language === "en"
                ? "Your progress is saved. You can resume anytime using your session code."
                : "Dein Fortschritt wurde gespeichert. Du kannst jederzeit mit deinem Sitzungscode fortfahren."}
            </p>
            {sessionCode && (
              <button
                onClick={copyCode}
                className="w-full flex items-center justify-between px-3 py-2 rounded bg-secondary hover:bg-accent transition-colors group"
                title={language === "en" ? "Click to copy" : "Klicken zum Kopieren"}
              >
                <span className="text-sm font-mono font-bold text-primary tracking-widest">{sessionCode}</span>
                {copied
                  ? <Check className="w-3.5 h-3.5 text-success shrink-0" />
                  : <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
                }
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-9 rounded bg-secondary text-sm font-medium text-secondary-foreground hover:bg-accent transition-colors"
              >
                {language === "en" ? "Stay" : "Bleiben"}
              </button>
              <button
                onClick={confirmExit}
                className="flex-1 h-9 rounded bg-destructive text-sm font-medium text-destructive-foreground hover:brightness-110 transition-all"
              >
                {language === "en" ? "Leave" : "Verlassen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFindings && (
        <FindingsReference language={language} onClose={() => setShowFindings(false)} />
      )}
    </>
  );
};

export default SystemHeader;
