import React, { createContext, useContext, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tourStyles.css';
import type { DriveStep } from 'driver.js';
import { useNavigate } from 'react-router-dom';

interface TourContextType {
  startTour: (steps: DriveStep[], navigateTo?: string) => void;
}

const TourContext = createContext<TourContextType | null>(null);

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside TourProvider');
  return ctx;
};

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();

  const startTour = useCallback((steps: DriveStep[], navigateTo?: string) => {
    const run = () => {
      // Small delay to ensure DOM is ready after navigation
      setTimeout(() => {
        const driverObj = driver({
          showProgress: true,
          animate: true,
          smoothScroll: true,
          allowClose: true,
          overlayOpacity: 0.5,
          stagePadding: 8,
          stageRadius: 8,
          nextBtnText: 'Далее →',
          prevBtnText: '← Назад',
          doneBtnText: 'Готово ✓',
          progressText: '{{current}} из {{total}}',
          steps,
        });
        driverObj.drive();
      }, 400);
    };

    if (navigateTo) {
      navigate(navigateTo);
      run();
    } else {
      run();
    }
  }, [navigate]);

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
    </TourContext.Provider>
  );
};
