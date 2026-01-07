'use client'
import { useEffect, useRef } from "react"



function drawHexagon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  lineColor: string,
  fillColor: string,
  text: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // 60 degrees per point
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = fillColor;

  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.fillText(text, centerX, centerY)

}

export default function CanvasTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Fill rectangle with gradient
    const hiveCharcoal = getComputedStyle(document.documentElement)
      .getPropertyValue('--hive-charcoal')
      .trim();
    const hiveYellow = getComputedStyle(document.documentElement)
      .getPropertyValue('--hive-yellow')
      .trim();

    drawHexagon(ctx, 100, 100, 50, hiveYellow, hiveCharcoal, "hello");
  }, [])

  return (
    <canvas
      id="comb"
      width="200"
      height="200"
      style={{
        border: "1px solid black",
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
      ref={canvasRef}
    >
      Your browser does not support the canvas element.
    </canvas>
  )
}
