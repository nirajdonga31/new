"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

export function Navbar() {
    const { user, loading } = useAuth();

    const handleLogout = async () => {
        await signOut(auth);
    };

    return (
        <header className="bg-white shadow-sm border-b sticky top-0 z-10">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-4xl">

                {/* Logo & Links */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="text-xl font-bold tracking-tight">
                        EventApp
                    </Link>
                    <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-600">
                        <Link href="/" className="hover:text-black transition">Events</Link>
                        {user && (
                            <Link href="/orders" className="hover:text-black transition">My Orders</Link>
                        )}
                    </nav>
                </div>

                {/* Auth Buttons */}
                <div className="flex items-center gap-3">
                    {loading ? (
                        <div className="h-9 w-20 bg-gray-100 animate-pulse rounded" />
                    ) : user ? (
                        <>
                            <span className="text-sm text-gray-500 hidden sm:block truncate max-w-[150px]">
                                {user.email}
                            </span>
                            <Button variant="outline" size="sm" onClick={handleLogout}>
                                Logout
                            </Button>
                        </>
                    ) : (
                        <>
                            <Link href="/login">
                                <Button variant="ghost" size="sm">Log In</Button>
                            </Link>
                            <Link href="/register">
                                <Button size="sm">Register</Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}