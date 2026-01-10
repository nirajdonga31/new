import { auth } from "@/lib/firebase";

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}