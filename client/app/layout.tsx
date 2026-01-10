import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/NavBar";
import "./globals.css";

export const metadata = {
  title: "Event Booking App",
  description: "Book your seats now",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen font-sans text-gray-900">
        <AuthProvider>
          <Navbar />
          <main className="container mx-auto px-4 py-8 max-w-4xl">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}