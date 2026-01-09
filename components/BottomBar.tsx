'use client'
import { useEffect, useRef } from "react"
import styles from "./BottomBar.module.css"
import { handleWordSubmit } from "@/lib/validateInput"

//TODO: prevent space and not alphabetic
export default function BottomBar() {
  const textIputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    if (textIputRef.current) {
      textIputRef.current.focus()
    }
  }, [])
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Prevent Enter key from bubbling to other elements (like hint button)
    if (e.key === 'Enter') {
      handleWordSubmit(textIputRef.current?.value)
      e.stopPropagation()
      return
    }

    // Allow only letters
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !/^[a-zA-Z]$/.test(e.key)
    ) {
      e.preventDefault()
    }
  }
  return (
    <div className={styles.bottomBar}>
      <button className={styles.bottomButton}>
        Ask hive

      </button>
      <div className={styles.inputAndHintContainer}>

        <input type="text" placeholder="enter a compound word"
          style={{
            flex: "1",
            borderRadius: "8px",
            textAlign: "center",
          }}
          ref={textIputRef}
          onKeyDown={handleKeyDown}
        />

      </div>
      <button className={styles.bottomButton}>
        Link

      </button>
    </div >
  )
}
