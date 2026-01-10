"use client";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
    const [form, setForm] = useState({ email: "", pass: "" });
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, form.email, form.pass);
            router.push("/");
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-sm border">
            <h1 className="text-2xl font-bold mb-6 text-center">Welcome Back</h1>
            <form onSubmit={handleLogin} className="space-y-4">
                <Input placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input type="password" placeholder="Password" onChange={(e) => setForm({ ...form, pass: e.target.value })} />
                <Button className="w-full">Sign In</Button>
            </form>
        </div>
    );
}