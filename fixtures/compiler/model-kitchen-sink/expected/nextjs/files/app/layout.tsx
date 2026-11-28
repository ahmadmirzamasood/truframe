import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import InView from "@/components/InView";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--tf-font-inter",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body>
        <InView />
        {children}
      </body>
    </html>
  );
}
