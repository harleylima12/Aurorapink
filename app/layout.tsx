import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FeedbackProvider } from "@/components/ui/Feedback";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Alvorada Veículos",
  description: "Concessionária de veículos Alvorada Veículos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-neutral-950 font-sans antialiased">
        <FeedbackProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </FeedbackProvider>
      </body>
    </html>
  );
}
