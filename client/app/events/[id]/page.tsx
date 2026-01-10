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

    const [hasJoined, setHasJoined] = useState(false);
    const isBooking = useRef(false);

    const fetchEvent = () => {
        if (id) apiRequest(`/events/${id}`).then(setEvent).catch(console.error);
    };

    const checkUserStatus = async () => {
        if (!user || !id) return;
        try {
            const res = await apiRequest("/orders");

            // 1. Auto-cancel stale pending orders
            // We check !isBooking.current so we don't kill the order we just tried to make
            const pending = res.orders.find((o: any) =>
                o.eventId === id && o.status === 'pending'
            );

            if (pending && !isBooking.current) {
                console.log("Auto-cancelling stale order...");
                await apiRequest(`/orders/${pending.id}/cancel`, { method: "POST" });
                fetchEvent();
            }

            // 2. Check if user has joined (paid/confirmed)
            const joined = res.orders.find((o: any) =>
                o.eventId === id && (o.status === 'paid' || o.status === 'confirmed')
            );
            setHasJoined(!!joined);

        } catch (err) {
            console.error("Status check failed:", err);
        }
    };

    useEffect(() => { fetchEvent(); }, [id]);
    useEffect(() => { checkUserStatus(); }, [id, user]);

    const book = async () => {
        if (!user) return router.push("/login");

        setLoading(true);
        isBooking.current = true;

        try {
            const quantityToBuy = (event?.price === 0) ? 1 : qty;

            const res = await apiRequest(`/events/${id}/join`, {
                method: "POST",
                body: JSON.stringify({ quantity: quantityToBuy }),
            });

            // --- FIX: Validation Logic ---
            const isPaidEvent = event.price > 0;

            if (isPaidEvent && !res.paymentUrl) {
                // If it's paid but no link, THROW ERROR instead of redirecting
                throw new Error("Server failed to generate payment link.");
            }

            if (res.paymentUrl) {
                window.location.href = res.paymentUrl;
            } else {
                // Only redirect to orders for Free events
                router.push("/orders");
            }

        } catch (err: any) {
            alert(err.message || "Booking failed");
            setLoading(false);
            isBooking.current = false; // Reset lock so cleanup can run if needed
        }
    };

    if (!event) return <div className="p-10 text-center">Loading event...</div>;

    const isFree = event.price === 0;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-lg border shadow-sm">
                <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
                <div className="flex justify-between text-gray-500 mb-8 border-b pb-4">
                    <span>📍 {event.location}</span>
                    <span>🎟️ {event.availableSeats} remaining</span>
                    <span>💲 ${event.price}</span>
                </div>

                {hasJoined && isFree ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                        <h3 className="text-lg font-semibold text-green-800">You're going!</h3>
                        <p className="text-green-600 mb-4">You have already joined this event.</p>
                        <Button variant="outline" onClick={() => router.push("/orders")}>
                            View Ticket
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-end gap-4">
                        {!isFree && (
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
                        )}

                        <Button onClick={book} disabled={loading || event.availableSeats < 1} className="flex-1" size="lg">
                            {loading ? "Processing..." : (isFree ? "Join for Free" : `Confirm Booking ($${event.price * qty})`)}
                        </Button>
                    </div>
                )}

                {hasJoined && !isFree && (
                    <p className="text-xs text-green-600 mt-2 text-center">
                        ✅ You already have tickets, but you can book more.
                    </p>
                )}
            </div>
        </div>
    );
}