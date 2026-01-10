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

    // --- DEBUGGING CHANGE ---
    if (!res.ok) {
        // This will print the REAL reason (e.g. "Order not found", "Stripe Error")
        console.error("🚨 BACKEND ERROR DETAILS:", data);
        throw new Error(data.error || "Request failed");
    }
    // ------------------------

    return data;
}