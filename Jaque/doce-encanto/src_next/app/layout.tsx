import type { Metadata } from "next";
import { Montserrat, Playfair_Display, Pinyon_Script } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});
const pinyon = Pinyon_Script({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pinyon",
});

export const metadata: Metadata = {
  title: "Jallu Confeitaria | Doces Artesanais Premium",
  description:
    "Confeitaria artesanal premium. Bolos, tortas e doces finos feitos com amor e ingredientes selecionados.",
  openGraph: {
    title: "Jallu Confeitaria",
    description: "Doces artesanais que transformam momentos em memória.",
    type: "website",
  },
};

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CupcakeCursor } from "@/components/cupcake-cursor";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="scroll-smooth" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          montserrat.variable,
          playfair.variable,
          pinyon.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <CupcakeCursor />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
