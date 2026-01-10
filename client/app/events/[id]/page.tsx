"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EventDetails() {
    const { id } = useParams();
    const { user } = useAuth();
    const router = useRouter();

    const [event, setEvent] = useState<any>(null);
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);

    // Track if we are intentionally leaving to pay (so we don't auto-cancel)
    const isBooking = useRef(false);

    const fetchEvent = () => {
        if (id) apiRequest(`/events/${id}`).then(setEvent).catch(console.error);
    };

    // --- AUTOMATIC CLEANUP LOGIC ---
    const cleanupStaleOrders = async () => {
        if (!user || !id) return;
        try {
            // 1. Check if user has a pending order for this event
            const res = await apiRequest("/orders");
            const pending = res.orders.find((o: any) =>
                o.eventId === id && o.status === 'pending'
            );

            // 2. If found, SILENTLY cancel it immediately
            if (pending) {
                console.log("Found stale pending order. Auto-cancelling...");
                await apiRequest(`/orders/${pending.id}/cancel`, { method: "POST" });

                // 3. Refresh event to show the seats are now free
                fetchEvent();
            }
        } catch (err) {
            console.error("Auto-cleanup failed:", err);
        }
    };

    useEffect(() => {
        fetchEvent();
    }, [id]);

    useEffect(() => {
        // Run cleanup whenever the user lands on this page
        cleanupStaleOrders();
    }, [id, user]);

    const book = async () => {
        if (!user) return router.push("/login");

        setLoading(true);
        isBooking.current = true; // Mark that we are intentionally leaving

        try {
            const res = await apiRequest(`/events/${id}/join`, {
                method: "POST",
                body: JSON.stringify({ quantity: qty }),
            });
            if (res.paymentUrl) window.location.href = res.paymentUrl;
            else router.push("/orders");
        } catch (err: any) {
            alert(err.message);
            setLoading(false);
            isBooking.current = false; // Reset if failed
        }
    };

    if (!event) return <div className="p-10 text-center">Loading event...</div>;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-lg border shadow-sm">
                <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
                <div className="flex justify-between text-gray-500 mb-8 border-b pb-4">
                    <span>📍 {event.location}</span>
                    <span>🎟️ {event.availableSeats} remaining</span>
                    <span>💲 ${event.price}</span>
                </div>

                {/* Standard Booking Form (No banners, just works) */}
                <div className="flex items-end gap-4">
                    <div className="w-24">
                        <label className="text-xs font-semibold uppercase text-gray-500">Seats</label>
                        <Input
                            type="number"
                            min={1}
                            max={4}
                            value={qty}
                            onChange={(e) => setQty(Number(e.target.value))}
                        />
                    </div>
                    <Button onClick={book} disabled={loading || event.availableSeats < 1} className="flex-1" size="lg">
                        {loading ? "Processing..." : `Confirm Booking ($${event.price * qty})`}
                    </Button>
                </div>
            </div>
        </div>
    );
}