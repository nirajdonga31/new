"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login() {
    const [form, setForm] = useState({ email: "", pass: "" });
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await signInWithEmailAndPassword(auth, form.email, form.pass);
            router.push("/");
        } catch (err: any) {
            setError("Invalid email or password");
        }
    };

    return (
        <div className="flex justify-center items-center min-h-[80vh]">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center">Welcome Back</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                            placeholder="Email"
                            type="email"
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                        <Input
                            type="password"
                            placeholder="Password"
                            onChange={(e) => setForm({ ...form, pass: e.target.value })}
                        />

                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                        <Button className="w-full" type="submit">Sign In</Button>

                        <p className="text-sm text-center text-gray-500 mt-4">
                            Don't have an account?{" "}
                            <Link href="/register" className="text-blue-600 hover:underline">
                                Register
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}