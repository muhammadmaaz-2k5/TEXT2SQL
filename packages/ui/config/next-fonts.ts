// Optional: load the same fonts via next/font (no files needed) instead of /fonts
import { Bricolage_Grotesque, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
export const display = Bricolage_Grotesque({ subsets:['latin'], variable:'--font-display' });
export const body = IBM_Plex_Sans({ subsets:['latin'], weight:['400','500','600'], variable:'--font-body' });
export const mono = JetBrains_Mono({ subsets:['latin'], weight:['400','500','700'], variable:'--font-mono' });
// <html className={`${display.variable} ${body.variable} ${mono.variable}`}>
