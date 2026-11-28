import type { ReactNode } from "react";
import InView from "@/components/InView";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InView />
        {children}
      </body>
    </html>
  );
}
