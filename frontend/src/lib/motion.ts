import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Shared easing so Motion and GSAP feel like one system. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export { gsap, ScrollTrigger, useGSAP }
