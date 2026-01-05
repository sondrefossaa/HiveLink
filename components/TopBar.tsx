'use client'

import styles from "./TopBar.module.css"
import Image from 'next/image';
import logo from '@/public/logo.svg';
import { PuzzleMode } from "@/types";
import { useState } from "react";



export default function TopBar() {

  const [currentPuzzleMode, setCurrentPuzzleMode] = useState<PuzzleMode>("daily");
  function handleSelectMode(option: PuzzleMode) {
    setCurrentPuzzleMode(option)
  }
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
            Hello: <span style={{ color: "var(--hive-yellow)" }}>Sondre</span>
          </div>
          <div className={styles.streakContainer}>
            Streak: 0 <span style={{ fontSize: "1.5rem", }}>🐝</span>
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
          {(["daily", "practice"] as PuzzleMode[]).map((option) => (
            < button
              key={option}
              onClick={() => handleSelectMode(option)}
              className={styles.modeButton}
              style={{
                backgroundColor: currentPuzzleMode == option ? "var(--hive-yellow)" : "var(--hive-charcoal)",
                color: currentPuzzleMode == option ? "black" : "white",
                borderRadius: "8px",
                padding: "2px",
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
    </header >



  )
}
