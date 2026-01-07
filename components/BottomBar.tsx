
import styles from "./BottomBar.module.css"


//TODO: prevent space and not alphabetic
export default function BottomBar() {
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
        />

      </div>
      <button className={styles.bottomButton}>
        Link

      </button>
    </div >
  )
}
