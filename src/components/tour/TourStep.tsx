import React, { useEffect, useRef } from 'react';
import { useTour } from './TourContext';

interface TourStepProps {
  name: string;
  children: React.ReactElement;
}

export const TourStep = ({ name, children }: TourStepProps) => {
  const { registerElementLayout, isActive, currentStepData } = useTour();
  const childRef = useRef<any>(null);

  useEffect(() => {
    if (isActive) {
      // Para elementos dentro de modales o vistas animadas (BottomSheets), 
      // la posición puede cambiar después de que se active el tour.
      // Hacemos polling 10 veces cada 150ms para asegurar que capturamos la posición final asentada.
      let attempts = 0;
      const interval = setInterval(() => {
        childRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            registerElementLayout(name, { x, y, width, height });
          }
        });
        attempts++;
        if (attempts >= 10) clearInterval(interval);
      }, 150);
      
      return () => clearInterval(interval);
    }
  }, [isActive, name, registerElementLayout]);

  // Clonamos el elemento hijo para inyectarle la referencia directamente.
  // Esto evita envolverlo en un <View> extra que arruina el layout por los márgenes.
  return React.cloneElement(children as React.ReactElement<any>, {
    ref: childRef,
  });
};
