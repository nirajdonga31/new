import { auth } from "@/lib/firebase";

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";

    // 1. Prepare headers dynamically
    const headers: any = {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    // 2. ONLY add Content-Type if a body exists
    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        ...options,
        headers, // Use our fixed headers
    });

    // 3. Handle response
    const data = await res.json();

    if (!res.ok) {
        console.error("🚨 BACKEND ERROR DETAILS:", data);
        throw new Error(data.error || "Request failed");
    }

    return data;
}