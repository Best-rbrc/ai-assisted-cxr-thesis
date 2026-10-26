import { useState, useMemo } from "react";
import { CheckCircle2, Send, Mail } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import { studyDataService } from "@/services/studyDataService";
import SystemHeader from "@/components/SystemHeader";

const JIAN_POST_ITEMS = ["jian.post.1", "jian.post.2", "jian.post.3", "jian.post.4", "jian.post.5", "jian.post.6", "jian.post.7", "jian.post.8", "jian.post.9"];

const DebriefScreen = () => {
  const { screen, setScreen, setDebriefData, sessionCode, language, t, jianItemOrder } = useStudy();
  const [trustItems, setTrustItems] = useState<(number | null)[]>(new Array(9).fill(null));
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const displayOrder = useMemo(() => jianItemOrder, [jianItemOrder]);

  const setRating = (displayIndex: number, value: number) => {
    const originalIndex = displayOrder[displayIndex];
    setTrustItems(prev => { const next = [...prev]; next[originalIndex] = value; return next; });
  };

  const getRating = (displayIndex: number): number | null => trustItems[displayOrder[displayIndex]];

  const commentsTooShort = comments.trim().length < 10;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (trustItems.some(r => r === null) || commentsTooShort) {
      setShowErrors(true);
      setTimeout(() => {
        document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setIsSubmitting(true);
    setDebriefData({ postTrustItems: trustItems as number[], comments });
    if (sessionCode) {
      await studyDataService.saveDebrief(sessionCode, trustItems, comments);
    }
    setSubmitted(true);
    setScreen("complete");
    setIsSubmitting(false);
  };

  const handleEmailSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(language === "en" ? "Please enter an email address" : "Bitte gib eine E-Mail-Adresse ein");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(language === "en" ? "Please enter a valid email address" : "Bitte gib eine gültige E-Mail-Adresse ein");
      return;
    }
    setEmailError("");
    await studyDataService.saveEmailSubscription(trimmed);
    setEmailSent(true);
  };

  if (submitted || screen === "complete") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SystemHeader />
        <div className="flex-1 flex items-center justify-center p-5">
          <div className="glass-panel p-8 max-w-md w-full animate-fade-in text-center space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/10">
              <CheckCircle2 className="w-7 h-7 text-success" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">{t("debrief.thanks")}</h2>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">{t("debrief.thanksMessage")}</p>
              <p className="text-sm font-medium text-primary leading-relaxed">{t("debrief.shareHint")}</p>
            </div>

            {/* Email opt-in */}
            <div className="border-t border-border pt-5 mt-5 space-y-3">
              <div className="flex items-center gap-2 justify-center">
                <Mail className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "en" ? "Want to read the paper?" : "Möchtest du die Arbeit lesen?"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {language === "en"
                  ? "Leave your email and I'll send you the finished paper once it's done. Your email will be stored separately and anonymously - not connected to your survey responses in any way."
                  : "Hinterlasse deine E-Mail-Adresse und ich sende dir die fertige Arbeit zu. Deine E-Mail wird separat und anonym gespeichert – sie ist in keiner Weise mit deinen Umfrageantworten verknüpft."}
              </p>
              {emailSent ? (
                <div className="flex items-center gap-2 justify-center text-success text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {language === "en" ? "Email saved, thank you!" : "E-Mail gespeichert, vielen Dank!"}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                      placeholder={language === "en" ? "your@email.com" : "deine@email.com"}
                      className={`flex-1 h-10 px-3 rounded bg-secondary border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow ${emailError ? "border-destructive" : "border-border"}`}
                    />
                    <button
                      onClick={handleEmailSubmit}
                      disabled={!email.trim()}
                      className="h-10 px-4 rounded bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all disabled:opacity-30"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader breadcrumb="Final Survey" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-6 space-y-5 animate-fade-in">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("debrief.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("debrief.subtitle")}</p>
          </div>

          <div className="glass-panel p-4 sm:p-5 space-y-5">
            {displayOrder.map((originalIdx, displayIdx) => {
              const rating = getRating(displayIdx);
              const hasError = showErrors && rating === null;
              return (
                <div key={JIAN_POST_ITEMS[originalIdx]} className="space-y-2" data-error={hasError ? "true" : undefined}>
                  <p className={`text-sm font-medium ${hasError ? "text-destructive" : "text-foreground"}`}>
                    {t(JIAN_POST_ITEMS[originalIdx])}
                  </p>
                  <div className={`flex gap-px rounded overflow-hidden ${hasError ? "ring-1 ring-destructive bg-destructive/5" : "bg-border"}`}>
                    {[1, 2, 3, 4, 5, 6, 7].map(val => (
                      <button
                        key={val}
                        onClick={() => setRating(displayIdx, val)}
                        className={`flex-1 h-8 text-xs font-medium transition-all ${
                          rating === val ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  {displayIdx === 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground/60">
                      <span>{t("presurvey.scale.1")}</span>
                      <span>{t("presurvey.scale.7")}</span>
                    </div>
                  )}
                  {hasError && (
                    <p className="text-xs text-destructive">
                      {language === "en" ? "Please select a rating." : "Bitte eine Bewertung auswählen."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2" data-error={showErrors && commentsTooShort ? "true" : undefined}>
            <label className={`text-xs font-semibold uppercase tracking-wider ${showErrors && commentsTooShort ? "text-destructive" : "text-muted-foreground"}`}>
              {t("debrief.comments")} <span className="text-destructive">*</span>
            </label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder={t("debrief.placeholder")}
              rows={4}
              className={`w-full rounded bg-secondary border p-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary transition-shadow ${showErrors && commentsTooShort ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
            />
            <p className="text-xs text-muted-foreground/60 leading-relaxed">{t("debrief.commentHint")}</p>
            {showErrors && commentsTooShort && (
              <p className="text-xs text-destructive">
                {language === "en" ? "Please share your feedback (at least a short sentence)." : "Bitte teile dein Feedback (mindestens ein kurzer Satz)."}
              </p>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-10 rounded text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {t("debrief.submit")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DebriefScreen;
