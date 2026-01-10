"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation"; // New hooks
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CancelPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get("orderId");
    const [status, setStatus] = useState("Processing cancellation...");

    useEffect(() => {
        if (orderId) {
            // Immediately call the backend to release seats
            apiRequest(`/orders/${orderId}/cancel`, { method: "POST" })
                .then(() => setStatus("Reservation cancelled. Seats released."))
                .catch(() => setStatus("Reservation already expired or failed."));
        }
    }, [orderId]);

    return (
        <div className="flex justify-center items-center min-h-[60vh]">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle className="text-red-500">Payment Cancelled</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p>{status}</p>
                    <Button onClick={() => router.push("/")}>Return to Events</Button>
                </CardContent>
            </Card>
        </div>
    );
}