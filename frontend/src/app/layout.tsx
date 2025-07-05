import "./globals.css";
import { PresenceProvider } from "@/context/PresenceContext";

export const metadata = {
  title: "Satopon",
  description: "Satopon-c420",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        {/* Google Fonts Icons */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
          rel="stylesheet"
        />
      </head>
      <body>
        <PresenceProvider>{children}</PresenceProvider>
      </body>
    </html>
  );
}
