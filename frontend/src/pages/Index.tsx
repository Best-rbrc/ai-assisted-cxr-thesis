import { useState, useEffect, useRef } from "react";
import { StudyProvider } from "@/context/StudyContext";
import { useStudy } from "@/context/useStudy";
import LandingScreen from "@/screens/LandingScreen";
import ConsentScreen from "@/screens/ConsentScreen";
import WelcomeScreen from "@/screens/WelcomeScreen";
import BaselineScreen from "@/screens/BaselineScreen";
import PreSurveyScreen from "@/screens/PreSurveyScreen";
import InterfaceTutorialScreen from "@/screens/InterfaceTutorialScreen";
import TutorialScreen from "@/screens/TutorialScreen";
import TrialScreen from "@/screens/TrialScreen";
import BlockBreakScreen from "@/screens/BlockBreakScreen";
import BonusOfferScreen from "@/screens/BonusOfferScreen";
import DebriefScreen from "@/screens/DebriefScreen";
import LanguageToggle from "@/components/LanguageToggle";

const screenComponent = (screen: string) => {
  switch (screen) {
    case "landing": return <LandingScreen />;
    case "consent": return <ConsentScreen />;
    case "welcome": return <WelcomeScreen />;
    case "interface-tutorial": return <InterfaceTutorialScreen />;
    case "baseline": return <BaselineScreen />;
    case "pre-survey": return <PreSurveyScreen />;
    case "tutorial": return <TutorialScreen />;
    case "trial": return <TrialScreen />;
    case "block-break": return <BlockBreakScreen />;
    case "bonus-offer": return <BonusOfferScreen />;
    case "debrief":
    case "complete": return <DebriefScreen />;
    default: return <LandingScreen />;
  }
};

const StudyRouter = () => {
  const { screen } = useStudy();
  const [displayedScreen, setDisplayedScreen] = useState(screen);
  const [visible, setVisible] = useState(true);
  const prevScreen = useRef(screen);

  useEffect(() => {
    if (screen !== prevScreen.current) {
      prevScreen.current = screen;
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayedScreen(screen);
        setVisible(true);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [screen]);


  return (
    <div
      className="transition-opacity duration-200 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {screenComponent(displayedScreen)}
    </div>
  );
};

const Index = () => {
  return (
    <StudyProvider>
      <LanguageToggle />
      <StudyRouter />
    </StudyProvider>
  );
};

export default Index;
