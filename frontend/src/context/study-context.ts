import { createContext } from "react";
import type { StudyContextType } from "./study-types";

export const StudyContext = createContext<StudyContextType | null>(null);
