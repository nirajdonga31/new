"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Register() {
    const [form, setForm] = useState({ email: "", pass: "", confirm: "" });
    const [error, setError] = useState("");
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (form.pass !== form.confirm) {
            setError("Passwords do not match");
            return;
        }

        try {
            await createUserWithEmailAndPassword(auth, form.email, form.pass);
            router.push("/"); // Redirect to Home
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="flex justify-center items-center min-h-[80vh]">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center">Create an Account</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div>
                            <Input
                                placeholder="Email"
                                type="email"
                                required
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <Input
                                type="password"
                                placeholder="Password"
                                required
                                minLength={6}
                                onChange={(e) => setForm({ ...form, pass: e.target.value })}
                            />
                        </div>
                        <div>
                            <Input
                                type="password"
                                placeholder="Confirm Password"
                                required
                                minLength={6}
                                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                        <Button className="w-full" type="submit">Sign Up</Button>

                        <p className="text-sm text-center text-gray-500 mt-4">
                            Already have an account?{" "}
                            <Link href="/login" className="text-blue-600 hover:underline">
                                Login
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}