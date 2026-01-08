'use client'
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { GraphNode } from "@/types";
import { hiveYellow, hiveCharcoal } from "@/lib/colors";
import { createGraphNode, drawLinkBetweenNodes } from "@/lib/graphHelpers";
import { GameState } from "@/lib/gameState";
import { GetGraphLayout } from "@/lib/GraphLayout";
import { log } from "console";

const nodeSpacing = 200;
const nodeRadius = 80;
function drawHexagon(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  radius: number,
  isClicked: boolean = false,
  lineColor: string = hiveYellow,
  fillColor: string = hiveCharcoal,
  textColor: string = "white",
): void {
  const { currPos, word } = node;

  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = currPos.x + radius * Math.cos(angle);
    const y = currPos.y + radius * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();



  ctx.lineWidth = 5;
  ctx.strokeStyle = lineColor;
  ctx.stroke();

  // Draw text
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textColor;
  ctx.fillText(word, currPos.x, currPos.y);
  if (isClicked) {
    ctx.fillStyle = hiveYellow;
    ctx.fillText(`${node.parts.left} + ${node.parts.right}`, currPos.x, currPos.y + radius + 10);
  }
}


export default function Graph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetCanvasBtnRef = useRef<HTMLButtonElement>(null)
  const clickedNodeRef = useRef<(GraphNode | null)>(null);
  const [clickedNode, setClickedNode] = useState<(GraphNode | null)>(null);
  // Transform state
  const transformRef = useRef({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });

  // Touch/Mouse state
  const inputRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    touchDistance: 0, // For pinch zoom
    touchCenter: { x: 0, y: 0 }
  });

  // Nodes
  const nodesRef = useRef<GraphNode[]>([]);

  // Redraw function
  const redraw = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!ctx) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply DPR scale
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Apply user transform (zoom + pan)
    const { scale, offsetX, offsetY } = transformRef.current;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    console.log(offsetX, offsetY, scale)

    // Draw all nodes
    console.log("clicked", clickedNodeRef.current, clickedNodeRef.current === nodesRef.current[0])
    nodesRef.current.forEach(node => {
      drawHexagon(ctx, node, nodeRadius, clickedNodeRef.current === node);
    });

    // Draw connections
    if (nodesRef.current.length > 1) {
      drawLinkBetweenNodes(ctx, nodesRef.current[0], nodesRef.current[1]);
    }

  }, []);
  // Triggers when node clicked
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    console.log("sigma2")
    redraw(ctx);
  }, [clickedNode, redraw]);
  // Zoom towards point (works for wheel and pinch)
  const zoomAt = (clientX: number, clientY: number, zoomFactor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const oldScale = transformRef.current.scale;

    // Calculate new scale
    let newScale = oldScale * zoomFactor;

    // Clamp scale
    newScale = Math.max(0.1, Math.min(newScale, 10));

    // Calculate mouse position in canvas coordinates before zoom
    const mouseCanvasX = (mouseX - transformRef.current.offsetX) / oldScale;
    const mouseCanvasY = (mouseY - transformRef.current.offsetY) / oldScale;

    // Calculate new offset to keep mouse position fixed
    const newOffsetX = mouseX - mouseCanvasX * newScale;
    const newOffsetY = mouseY - mouseCanvasY * newScale;

    // Update transform
    transformRef.current = {
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    };

    redraw(ctx);
  };

  // Start panning
  const startPan = (clientX: number, clientY: number) => {
    inputRef.current.isDragging = true;
    inputRef.current.lastX = clientX;
    inputRef.current.lastY = clientY;
  };

  // Do panning
  const doPan = (clientX: number, clientY: number) => {
    if (!inputRef.current.isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dx = clientX - inputRef.current.lastX;
    const dy = clientY - inputRef.current.lastY;

    // Update offset
    transformRef.current.offsetX += dx;
    transformRef.current.offsetY += dy;

    // Update last position
    inputRef.current.lastX = clientX;
    inputRef.current.lastY = clientY;

    redraw(ctx);
  };

  // Stop panning
  const stopPan = () => {
    inputRef.current.isDragging = false;
    inputRef.current.touchDistance = 0;
  };

  // Get touch center for pinch zoom
  const getTouchCenter = (touches: TouchList) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  // Get touch distance for pinch zoom
  const getTouchDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize nodes
    // nodesRef.current = [
    //   createGraphNode(
    //     "betatest",
    //     { left: "beta", right: "test" },
    //     { x: 400, y: 300 }
    //   ),
    //   createGraphNode(
    //     "sigmabeta",
    //     { left: "sigma", right: "beta" },
    //     { x: 600, y: 300 }
    //   )
    // ];


    // Reset transform to center
    const resetTransform = () => {
      const rect = canvas.getBoundingClientRect();
      transformRef.current = {
        scale: 1,
        offsetX: 0,
        offsetY: 0
      };
      redraw(ctx);
    };

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      resetTransform();
    };

    // ========== MOUSE EVENTS ==========
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        e.preventDefault();
        startPan(e.clientX, e.clientY);
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      doPan(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      stopPan();
      canvas.style.cursor = 'grab';
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Prevent trackpad jitter
      // TODO: maybe find better soulution as the sens might be different on other laptops
      if (Math.abs(e.deltaY) < 0.4) return;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Zoom out/in
      zoomAt(e.clientX, e.clientY, zoomFactor);
    };

    // ========== TOUCH EVENTS ==========
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        // Single touch - panning
        startPan(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        // Two touches - prepare for pinch zoom
        inputRef.current.touchDistance = getTouchDistance(e.touches);
        inputRef.current.touchCenter = getTouchCenter(e.touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1 && inputRef.current.isDragging) {
        // Single touch panning
        doPan(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        // Two touches - pinch zoom
        const currentDistance = getTouchDistance(e.touches);
        const currentCenter = getTouchCenter(e.touches);

        if (inputRef.current.touchDistance > 0) {
          // Calculate zoom factor based on distance change
          const zoomFactor = currentDistance / inputRef.current.touchDistance;

          // Zoom towards the center point
          zoomAt(
            currentCenter.x,
            currentCenter.y,
            zoomFactor
          );

          // Update for next frame
          inputRef.current.touchDistance = currentDistance;
          inputRef.current.touchCenter = currentCenter;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 0) {
        // All touches ended
        stopPan();
      } else if (e.touches.length === 1) {
        // One finger lifted, switch to pan mode with remaining finger
        inputRef.current.isDragging = true;
        inputRef.current.lastX = e.touches[0].clientX;
        inputRef.current.lastY = e.touches[0].clientY;
        inputRef.current.touchDistance = 0;
      }
    };

    // Keyboard events
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        resetTransform();
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      // e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const { scale, offsetX, offsetY } = transformRef.current;

      // Convert screen coordinates to transformed canvas coordinates
      const canvasX = (e.clientX - rect.left - offsetX) / scale;
      const canvasY = (e.clientY - rect.top - offsetY) / scale;

      console.log('Click at:', {
        screen: { x: e.clientX, y: e.clientY },
        canvas: { x: canvasX, y: canvasY },
        scale,
        offsetX,
        offsetY
      });

      // Check each node
      nodesRef.current.forEach(node => {
        const dx = canvasX - node.currPos.x;
        const dy = canvasY - node.currPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= nodeRadius) {
          console.log('Node clicked:', node.word, 'at distance', distance);
          // 
          setClickedNode(node);
          clickedNodeRef.current = node;

          return;
        }
      });
    };
    //   () => { }
    //   const dpr = window.devicePixelRatio || 1;
    //   const rect = canvas.getBoundingClientRect();
    //
    //   canvas.width = rect.width * dpr;
    //   canvas.height = rect.height * dpr;
    //
    //   resetTransform();
    // }();
    // Initial setup
    resizeCanvas();

    // Use canvas dimensions, not screen dimensions
    const layout = GetGraphLayout(
      canvas.width / (window.devicePixelRatio || 1),
      canvas.height / (window.devicePixelRatio || 1)
    );
    nodesRef.current = layout.graphNodes;
    // Need to draw the nodes
    redraw(ctx)
    // ========== ADD EVENT LISTENERS ==========

    // Mouse events (desktop)
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Touch events (mobile)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener("pointerdown", handlePointerDown)
    // Keyboard
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resizeCanvas);

    // Prevent context menu on long press (mobile)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    resetCanvasBtnRef.current.addEventListener("click", resetTransform);
    return () => {
      // Remove all event listeners to prevent mem leak when component dismounts
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);

      canvas.removeEventListener("pointerdown", handlePointerDown)


      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', resizeCanvas);
      resetCanvasBtnRef.current.removeEventListener("click", resetTransform);

    };
  }, [redraw]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          display: "block",
          cursor: "grab",
          touchAction: "none", // Prevent browser default behaviour like pull to refresh and zoom
          WebkitTouchCallout: "none", // prevent iOS callout menu
          WebkitUserSelect: "none", // prevent text selection
          userSelect: "none", // Same for non webkit
        }}
      >
        Your browser does not support the canvas element.
      </canvas>
      <button
        style={{
          position: "absolute",
          right: "0",
          zIndex: "9999",
        }}
        ref={resetCanvasBtnRef}
      >reset canvas</button>
    </>
  );
}
