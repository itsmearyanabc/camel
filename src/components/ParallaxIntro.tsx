"use client";

import { useEffect, useRef } from "react";
import styles from "./ParallaxIntro.module.css";

export default function ParallaxIntro() {
  const mountainLeftRef = useRef<HTMLImageElement>(null);
  const mountainRightRef = useRef<HTMLImageElement>(null);
  const cloud1Ref = useRef<HTMLImageElement>(null);
  const cloud2Ref = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const manRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      let value = window.scrollY;
      
      if (value <= window.innerHeight) {
        if (mountainLeftRef.current) mountainLeftRef.current.style.left = `-${value / 0.7}px`;
        if (cloud2Ref.current) cloud2Ref.current.style.left = `-${value * 2}px`;
        if (mountainRightRef.current) mountainRightRef.current.style.left = `${value / 0.7}px`;
        if (cloud1Ref.current) cloud1Ref.current.style.left = `${value * 2}px`;
        if (textRef.current) textRef.current.style.bottom = `-${value}px`;
        if (manRef.current) manRef.current.style.height = `${window.innerHeight - value}px`;
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Trigger initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <section className={styles.parallaxSection}>
        <img src="https://cdn.phototourl.com/free/2026-07-29-539499ac-d901-4aa1-88c5-ee03acd85f18.png" id="bg" className={styles.parallaxImg} alt="Background" />
        <h2 ref={textRef} className={styles.parallaxText}>RELAX</h2>
        <img ref={manRef} src="https://cdn.phototourl.com/free/2026-07-30-5d933a19-1572-495d-bb96-35dce53c8057.png" className={`${styles.parallaxImg} ${styles.man}`} alt="Man" />
        <img ref={cloud1Ref} src="https://aryan-tayal.github.io/Mountains-Parallax/clouds_1.png" className={`${styles.parallaxImg} ${styles.cloud1}`} alt="Cloud 1" />
        <img ref={cloud2Ref} src="https://aryan-tayal.github.io/Mountains-Parallax/clouds_2.png" className={`${styles.parallaxImg} ${styles.cloud2}`} alt="Cloud 2" />
        <img ref={mountainLeftRef} src="https://cdn.phototourl.com/free/2026-07-20-634c9c7b-2437-4524-874e-a9fb2f7f7b60.png" className={`${styles.parallaxImg} ${styles.mountainLeft}`} alt="Mountain Left" />
        <img ref={mountainRightRef} src="https://cdn.phototourl.com/free/2026-07-20-fc540900-235b-4f1c-bf4f-0b4e26aae16d.png" className={`${styles.parallaxImg} ${styles.mountainRight}`} alt="Mountain Right" />
      </section>

      {/* Moving Text Line wrapper before dashboard content */}
      <div className={styles.movingLineWrapper}>
        <div className={styles.movingLine}>
          Breathe Deeply As Gentle Stillness Settles Over Your Mind, Letting Soothing Calm Wash Away Each Worried Thought, Releasing Happy Feelings That Bring Pure Peace, Guiding You To Soft And Easy Rest.
        </div>
      </div>
    </>
  );
}
