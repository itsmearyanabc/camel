"use client";

import { useEffect, useState } from "react";

export default function CursorAnimation() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isPointer, setIsPointer] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      const target = e.target as HTMLElement;
      const isClickable = 
        target.tagName.toLowerCase() === 'a' ||
        target.tagName.toLowerCase() === 'button' ||
        target.closest('a') !== null ||
        target.closest('button') !== null;
        
      setIsPointer(isClickable);
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  return (
    <>
      <div 
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "30px",
          height: "30px",
          borderRadius: "50%",
          border: "2px solid rgba(189,123,28,0.5)",
          transform: `translate(${position.x - 15}px, ${position.y - 15}px) scale(${isPointer ? 1.5 : 1})`,
          transition: "transform 0.15s ease-out",
          pointerEvents: "none",
          zIndex: 9999,
          mixBlendMode: "difference"
        }}
      />
      <div 
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: "rgba(189,123,28,1)",
          transform: `translate(${position.x - 4}px, ${position.y - 4}px)`,
          transition: "transform 0.05s linear",
          pointerEvents: "none",
          zIndex: 10000,
        }}
      />
    </>
  );
}
