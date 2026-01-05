'use client'

import styles from "./TopBar.module.css"
import Image from 'next/image';
import logo from '@/public/logo.svg';
import { PuzzleMode } from "@/types";
import { useState, useEffect, useRef, useLayoutEffect } from "react";



export default function TopBar() {

  const [currentPuzzleMode, setCurrentPuzzleMode] = useState<PuzzleMode>("daily");
  const [beeTargetPos, setBeeTargetPos] = useState({ x: 0, y: 0 });
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function setBeeTargetPosFromElement(element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();
    setBeeTargetPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    })

  }

  function handleSelectMode(option: PuzzleMode, index: number) {
    setCurrentPuzzleMode(option)
    const pressedButton: HTMLButtonElement | null = buttonRefs.current[index];
    setBeeTargetPosFromElement(pressedButton)
  }
  // TODO: make a useEffect that updates the bee pos when window rezises
  //
  // Effect to get the initial bee pos on daily button, need to delay to make sure the buttonRefs are ready
  useEffect(() => {
    const timer = setTimeout(() => {
      const initialButton = buttonRefs.current[0];
      if (initialButton) {
        const rect = initialButton.getBoundingClientRect();
        setBeeTargetPos({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, []);
  return (
    <header className={styles.mainContainer}
    >
      <section className={styles.logoTitleStreakName}>
        <div className={styles.logoContainer}>
          <Image
            src={logo}
            alt="Logo"
            fill={true}
          />
        </div>
        <h1
          className={styles.title}
        >HiveLink</h1>
        <div className={styles.nameStreakContainer}>
          <div className={styles.nameContainer}>
            Hello <span style={{ color: "var(--hive-yellow)" }}>Sondre</span> <span style={{ fontSize: "1.2rem", }}>🐝</span>
          </div>
          <div className={styles.streakContainer}>
            Streak: 0
          </div>
        </div>

      </section>

      {/* stats */}
      <section className={styles.statsContainer}>
        <div className={styles.statDisplay}>
          <h1 className={styles.statValue}>0</h1>
          <h2 className={styles.statTitle}>WORDS</h2>
        </div>
        <div className={styles.verticalDevider} />
        <div className={styles.statDisplay}>
          <h1 className={styles.statValue}>0</h1>
          <h2 className={styles.statTitle}>LAYERS</h2>
        </div>
        <div className={styles.statDisplay}>

        </div>
      </section>
      <section className={styles.leaderboardAndShareContainer}>
        {/* mode select */}
        <div className={styles.modeSelectContainer}>
          {(["daily", "practice"] as PuzzleMode[]).map((option, index) => (
            < button
              key={option}
              ref={(el) => buttonRefs.current[index] = el}
              onClick={() => handleSelectMode(option, index)}
              className={styles.modeButton}
              style={{
                backgroundColor: currentPuzzleMode == option ? "var(--hive-yellow)" : "var(--hive-charcoal)",
                color: currentPuzzleMode == option ? "black" : "white",
              }}
            >
              {option}
            </button>
          ))
          }
        </div>

        <button className={styles.leaderboardButton}>

          <span className={styles.leaderBoardText}>Leaderboard</span>
          {/* Pokal svg */}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21"
            />
          </svg>
        </button>
      </section>


      {/* floating bee */}
      <span style={{
        fontSize: "1.2rem",
        position: "absolute",
        left: `${beeTargetPos.x}px`,
        top: `${beeTargetPos.y}px`,
        transform: 'translate(-50%, -50%)', // Center on the point
        transition: 'all 0.5s ease', // Smooth movement
        pointerEvents: 'none', // Click through
        zIndex: 1000,
      }}>🐝</span>
    </header >



  )
}
