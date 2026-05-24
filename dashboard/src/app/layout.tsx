import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Joule — Carbon-aware AI Gateway",
  description: "Joule dashboard",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px" }}>
        {children}
      </body>
    </html>
  )
}
