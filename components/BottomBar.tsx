
import styles from "./BottomBar.module.css"


//TODO: prevent space and not alphabetic
export default function BottomBar() {
  return (
    <div style={{
      display: "flex",
      position: "fixed",
      bottom: "0",
      width: "100%",
      height: "20vh",
      backgroundColor: "gray",
      justifyContent: "center",
      alignItems: "center",
    }}>
      <div className={styles.inputAndHintContainer}>
        <button
          style={{
            flex: "0.1",
            background: 'var(--hive-yellow)',
            border: '1px solid var(--hive-yellow)',
            borderRadius: '8px',
            padding: '0 16px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Hint

        </button>
        <input type="text" placeholder="enter a compound word"
          style={{
            flex: "1",
            borderRadius: "8px",
            textAlign: "center",
          }}
        />
        <button
          style={{
            flex: "0.1",

            background: 'var(--hive-yellow)',
            border: '1px solid var(--hive-yellow)',
            borderRadius: '8px',
            padding: '0 16px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Submit

        </button>
      </div>
    </div >
  )
}
