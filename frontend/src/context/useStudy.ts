import { useContext } from "react";
import { StudyContext } from "./study-context";

export const useStudy = () => {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error("useStudy must be used within StudyProvider");
  return ctx;
};
