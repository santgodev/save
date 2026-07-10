import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';

export type TourStepType = {
  name: string;
  title: string;
  description: string;
  iconName?: string;
  order: number;
};

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GlobalProgressType = {
  step: number;
  total: number;
};

interface TourContextData {
  isActive: boolean;
  currentStepIndex: number;
  steps: TourStepType[];
  startTour: (steps: TourStepType[], onTourComplete?: () => void, globalProgress?: GlobalProgressType) => void;
  nextStep: () => void;
  stopTour: () => void;
  registerElementLayout: (name: string, layout: LayoutRect) => void;
  currentElementLayout: LayoutRect | null;
  currentStepData: TourStepType | null;
  globalProgress: GlobalProgressType | null;
}

const TourContext = createContext<TourContextData | null>(null);

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState<TourStepType[]>([]);
  const [globalProgress, setGlobalProgress] = useState<GlobalProgressType | null>(null);
  
  // Ref to store layouts of registered elements
  const layoutsRef = useRef<Record<string, LayoutRect>>({});
  // State to trigger re-render when a layout is needed/updated
  const [currentLayout, setCurrentLayout] = useState<LayoutRect | null>(null);
  const onTourCompleteRef = useRef<(() => void) | undefined>(undefined);

  const startTour = useCallback((tourSteps: TourStepType[], onTourComplete?: () => void, progress?: GlobalProgressType) => {
    // Sort steps by order
    const sortedSteps = [...tourSteps].sort((a, b) => a.order - b.order);
    setSteps(sortedSteps);
    setCurrentStepIndex(0);
    setGlobalProgress(progress || null);
    setIsActive(true);
    
    // Set initial layout if already registered
    if (sortedSteps.length > 0 && layoutsRef.current[sortedSteps[0].name]) {
      setCurrentLayout(layoutsRef.current[sortedSteps[0].name]);
    } else {
      setCurrentLayout(null);
    }
    
    onTourCompleteRef.current = onTourComplete;
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      setCurrentLayout(layoutsRef.current[steps[nextIdx].name] || null);
    } else {
      setIsActive(false);
      if (onTourCompleteRef.current) {
        onTourCompleteRef.current();
        onTourCompleteRef.current = undefined;
      }
    }
  }, [currentStepIndex, steps]);

  const stopTour = useCallback(() => {
    setIsActive(false);
    if (onTourCompleteRef.current) {
      onTourCompleteRef.current();
      onTourCompleteRef.current = undefined;
    }
  }, []);

  const registerElementLayout = useCallback((name: string, layout: LayoutRect) => {
    layoutsRef.current[name] = layout;
    
    // If we are currently on this step but missing layout, update it
    if (isActive && steps[currentStepIndex]?.name === name) {
      setCurrentLayout((prev) => {
        if (
          prev && 
          Math.abs(prev.x - layout.x) < 1 && 
          Math.abs(prev.y - layout.y) < 1 && 
          Math.abs(prev.width - layout.width) < 1 && 
          Math.abs(prev.height - layout.height) < 1
        ) {
          return prev; // No layout change, prevent re-render loop
        }
        return layout;
      });
    }
  }, [isActive, currentStepIndex, steps]);

  const contextValue = useMemo(() => ({
    isActive,
    currentStepIndex,
    steps,
    startTour,
    nextStep,
    stopTour,
    registerElementLayout,
    currentElementLayout: currentLayout,
    currentStepData: steps[currentStepIndex] || null,
    globalProgress
  }), [isActive, currentStepIndex, steps, startTour, nextStep, stopTour, registerElementLayout, currentLayout, globalProgress]);

  return (
    <TourContext.Provider value={contextValue}>
      {children}
    </TourContext.Provider>
  );
};
