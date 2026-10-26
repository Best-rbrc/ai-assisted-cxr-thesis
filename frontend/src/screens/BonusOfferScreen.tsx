import { Heart, ArrowRight, X } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import SystemHeader from "@/components/SystemHeader";

const BonusOfferScreen = () => {
  const { setScreen, initializeBonusCases, language, t, baselineResponses } = useStudy();

  const handleAccept = () => {
    initializeBonusCases();
    setScreen("trial");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader />

      <div className="flex-1 flex items-center justify-center p-5">
        <div className="glass-panel p-6 sm:p-8 max-w-md w-full animate-fade-in text-center space-y-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Heart className="w-6 h-6 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              {language === "en" ? "You're almost done!" : "Sie sind fast fertig!"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {language === "en"
                ? "Do you still have a few minutes? Completing a few extra cases would greatly help with my bachelor's thesis; every additional response makes the analysis more robust."
                : "Haben Sie noch ein paar Minuten? Ein paar zusätzliche Fälle würden meiner Bachelorarbeit sehr helfen; jede weitere Antwort macht die Analyse aussagekräftiger."}
            </p>
          </div>

          <div className="glass-panel p-3 text-xs text-muted-foreground">
            <p>
              {language === "en"
                ? "≈ 5 additional cases · ~5–8 minutes · Same format as before"
                : "≈ 5 zusätzliche Fälle · ~5–8 Minuten · Selbes Format wie zuvor"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleAccept}
              className="w-full h-10 rounded text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              <Heart className="w-4 h-4" />
              {language === "en" ? "Yes, I'll do a few more!" : "Ja, ich mache gerne noch ein paar!"}
            </button>
            <button
              onClick={() => setScreen(baselineResponses.length > 0 ? "debrief" : "baseline")}
              className="w-full h-9 rounded text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-all flex items-center justify-center gap-2"
            >
              {language === "en" ? "No thanks, continue" : "Nein danke, weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BonusOfferScreen;
