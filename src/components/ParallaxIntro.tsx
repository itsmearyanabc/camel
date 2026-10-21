"use client";

import { useEffect, useRef } from "react";
import styles from "./ParallaxIntro.module.css";

/**
 * Every image layer is served from public/parallax. They used to be hotlinked
 * from free image hosts, and when those uploads expired the intro silently lost
 * its background and side layers and printed their alt text in the corner
 * instead. Files in the repo cannot expire.
 *
 * The layers are decorative, so alt is empty and a layer that still fails to
 * load removes itself rather than leaving a broken-image box behind.
 */
const hideIfBroken = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

// Crimson velvet with gold trim, as approved in the Claude Design canvas
// "Camel971 Intro Curtains". The curtains and valance are inline SVG rather
// than images, so they stay sharp at any size and have nothing to expire.
const VELVET = { dark: "#2b0309", mid: "#8e1226", lit: "#c42039" };
const GOLD = "#e4ad4d";

// Left curtain, tied back: full width at the top, pinched at the tie-back,
// flaring to the floor. The right curtain is this shape mirrored.
const LEFT_SHAPE = "M0 0 H500 C490 260 300 470 228 580 C300 700 360 860 382 1000 H0 Z";
const LEFT_EDGE = "M500 0 C490 260 300 470 228 580 C300 700 360 860 382 1000";
const RIGHT_SHAPE = "M500 0 H0 C10 260 200 470 272 580 C200 700 140 860 118 1000 H500 Z";
const RIGHT_EDGE = "M0 0 C10 260 200 470 272 580 C200 700 140 860 118 1000";

const SCALLOPS =
  "Q1350 108 1260 62 Q1170 108 1080 62 Q990 108 900 62 Q810 108 720 62 " +
  "Q630 108 540 62 Q450 108 360 62 Q270 108 180 62 Q90 108 0 62";

function Curtain({ side, curtainRef }: { side: "left" | "right"; curtainRef: React.Ref<SVGSVGElement> }) {
  const left = side === "left";
  const id = (name: string) => `camel-curtain-${side}-${name}`;
  return (
    <svg
      ref={curtainRef}
      aria-hidden="true"
      viewBox="0 0 500 1000"
      preserveAspectRatio="none"
      className={`${styles.curtain} ${left ? styles.curtainLeft : styles.curtainRight}`}
    >
      <defs>
        {/* objectBoundingBox keeps the same number of folds on a phone as on a desktop */}
        <linearGradient id={id("fold")} x1="0" y1="0" x2="0.11" y2="0" spreadMethod="repeat">
          <stop offset="0" stopColor={VELVET.dark} />
          <stop offset="0.38" stopColor={VELVET.mid} />
          <stop offset="0.52" stopColor={VELVET.lit} />
          <stop offset="0.66" stopColor={VELVET.mid} />
          <stop offset="1" stopColor={VELVET.dark} />
        </linearGradient>
        <linearGradient id={id("drop")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={id("wall")} x1={left ? "0" : "1"} y1="0" x2={left ? "1" : "0"} y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d48a" />
          <stop offset="0.5" stopColor={GOLD} />
          <stop offset="1" stopColor="#9a6a1c" />
        </linearGradient>
      </defs>
      <path d={left ? LEFT_SHAPE : RIGHT_SHAPE} fill={`url(#${id("fold")})`} />
      <path d={left ? LEFT_SHAPE : RIGHT_SHAPE} fill={`url(#${id("drop")})`} />
      <path d={left ? LEFT_SHAPE : RIGHT_SHAPE} fill={`url(#${id("wall")})`} />
      <path d={left ? LEFT_EDGE : RIGHT_EDGE} fill="none" stroke={GOLD} strokeWidth="4" vectorEffect="non-scaling-stroke" />
      {/* tie-back rope and tassel */}
      <rect x={left ? 0 : 256} y="566" width="244" height="26" rx="13" fill={`url(#${id("gold")})`} />
      <path d={left ? "M222 590 H250 L262 668 H210 Z" : "M250 590 H278 L290 668 H238 Z"} fill={`url(#${id("gold")})`} />
    </svg>
  );
}

export default function ParallaxIntro() {
  const cloud1Ref = useRef<HTMLImageElement>(null);
  const cloud2Ref = useRef<HTMLImageElement>(null);
  const curtainLeftRef = useRef<SVGSVGElement>(null);
  const curtainRightRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const manRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      let value = window.scrollY;

      if (value <= window.innerHeight) {
        // Curtains part at the speed the old side layers used to slide.
        if (curtainLeftRef.current) curtainLeftRef.current.style.transform = `translateX(-${value / 0.7}px)`;
        if (curtainRightRef.current) curtainRightRef.current.style.transform = `translateX(${value / 0.7}px)`;
        if (cloud2Ref.current) cloud2Ref.current.style.left = `-${value * 2}px`;
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
        <h2 ref={textRef} className={styles.parallaxText}>RELAX</h2>
        <img ref={manRef} src="/parallax/man-dune.webp" className={`${styles.parallaxImg} ${styles.man}`} alt="" onError={hideIfBroken} />
        <img ref={cloud1Ref} src="/parallax/clouds-1.webp" className={`${styles.parallaxImg} ${styles.cloud1}`} alt="" onError={hideIfBroken} />
        <img ref={cloud2Ref} src="/parallax/clouds-2.webp" className={`${styles.parallaxImg} ${styles.cloud2}`} alt="" onError={hideIfBroken} />
        <Curtain side="left" curtainRef={curtainLeftRef} />
        <Curtain side="right" curtainRef={curtainRightRef} />
        <svg aria-hidden="true" viewBox="0 0 1440 110" preserveAspectRatio="none" className={styles.valance}>
          <defs>
            <linearGradient id="camel-valance-fold" x1="0" y1="0" x2="0.05" y2="0" spreadMethod="repeat">
              <stop offset="0" stopColor={VELVET.dark} />
              <stop offset="0.5" stopColor={VELVET.lit} />
              <stop offset="1" stopColor={VELVET.dark} />
            </linearGradient>
          </defs>
          <path d={`M0 0 H1440 V62 ${SCALLOPS} Z`} fill="url(#camel-valance-fold)" />
          <path d={`M1440 62 ${SCALLOPS}`} fill="none" stroke={GOLD} strokeWidth="4" vectorEffect="non-scaling-stroke" />
        </svg>
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
