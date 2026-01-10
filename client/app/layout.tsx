import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen font-sans text-gray-900">
        <AuthProvider>
          <header className="p-4 bg-white shadow-sm mb-6 flex gap-6 text-sm font-medium">
            <a href="/" className="hover:underline">Events</a>
            <a href="/orders" className="hover:underline">My Orders</a>
          </header>
          <main className="container mx-auto px-4 max-w-4xl">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}