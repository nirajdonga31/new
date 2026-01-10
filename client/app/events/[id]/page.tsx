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

    // NEW: Track if user is already a confirmed attendee
    const [hasJoined, setHasJoined] = useState(false);

    const isBooking = useRef(false);

    const fetchEvent = () => {
        if (id) apiRequest(`/events/${id}`).then(setEvent).catch(console.error);
    };

    // --- CHECK USER STATUS ---
    const checkUserStatus = async () => {
        if (!user || !id) return;
        try {
            const res = await apiRequest("/orders");

            // 1. Check for Pending (Stale) Orders to auto-cancel
            const pending = res.orders.find((o: any) =>
                o.eventId === id && o.status === 'pending'
            );
            if (pending && !isBooking.current) {
                console.log("Auto-cancelling stale order...");
                await apiRequest(`/orders/${pending.id}/cancel`, { method: "POST" });
                fetchEvent();
            }

            // 2. NEW: Check for Confirmed/Paid Orders
            const joined = res.orders.find((o: any) =>
                o.eventId === id && (o.status === 'paid' || o.status === 'confirmed')
            );
            setHasJoined(!!joined);

        } catch (err) {
            console.error("Status check failed:", err);
        }
    };

    useEffect(() => {
        fetchEvent();
    }, [id]);

    useEffect(() => {
        checkUserStatus();
    }, [id, user]);

    const book = async () => {
        if (!user) return router.push("/login");

        setLoading(true);
        isBooking.current = true;

        try {
            // For free events, force quantity to 1
            const quantityToBuy = (event.price === 0) ? 1 : qty;

            const res = await apiRequest(`/events/${id}/join`, {
                method: "POST",
                body: JSON.stringify({ quantity: quantityToBuy }),
            });

            if (res.paymentUrl) window.location.href = res.paymentUrl;
            else router.push("/orders");

        } catch (err: any) {
            alert(err.message);
            setLoading(false);
            isBooking.current = false;
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

                {/* LOGIC: If Free & Joined -> Hide Form. Else -> Show Form */}
                {hasJoined ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                        <h3 className="text-lg font-semibold text-green-800">You're going!</h3>
                        <p className="text-green-600 mb-4">You have already joined this event.</p>
                        <Button variant="outline" onClick={() => router.push("/orders")}>
                            View Ticket
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-end gap-4">
                        {/* Hide Quantity Input for Free Events */}
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
            </div>
        </div>
    );
}