"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

    // NEW: Track pending orders to handle "Browser Back" button issues
    const [pendingOrder, setPendingOrder] = useState<any>(null);

    // 1. Fetch Event Details
    const fetchEvent = () => {
        if (id) apiRequest(`/events/${id}`).then(setEvent).catch(console.error);
    };

    // 2. NEW: Check if this user already has a pending reservation for THIS event
    const checkPendingOrder = async () => {
        if (!user || !id) return;
        try {
            const res = await apiRequest("/orders");
            // Look for an order that matches this event AND is 'pending'
            const pending = res.orders.find((o: any) =>
                o.eventId === id && o.status === 'pending'
            );
            setPendingOrder(pending || null);
        } catch (err) {
            console.error("Failed to check pending orders", err);
        }
    };

    useEffect(() => {
        fetchEvent();
    }, [id]);

    useEffect(() => {
        checkPendingOrder();
    }, [id, user]);

    // 3. NEW: Release seats if user wants to cancel previous attempt
    const releaseSeats = async () => {
        if (!pendingOrder) return;
        if (!confirm("Are you sure you want to release your held seats?")) return;

        setLoading(true);
        try {
            await apiRequest(`/orders/${pendingOrder.id}/cancel`, { method: "POST" });
            setPendingOrder(null); // Clear local state
            fetchEvent(); // Refresh event data to show correct seat count
        } catch (err: any) {
            alert(err.message || "Failed to cancel");
        } finally {
            setLoading(false);
        }
    };

    const book = async () => {
        if (!user) return router.push("/login");
        setLoading(true);
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
        }
    };

    if (!event) return <div className="p-10 text-center">Loading event...</div>;

    return (
        <div className="max-w-2xl mx-auto space-y-6">

            {/* NEW: Warning Banner for Pending Orders */}
            {pendingOrder && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h3 className="font-bold text-yellow-800">You have seats reserved!</h3>
                        <p className="text-sm text-yellow-700">
                            You have a pending order for <strong>{pendingOrder.quantity} tickets</strong>.
                            Please check your orders or release these seats to book again.
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => router.push("/orders")}>
                            View Order
                        </Button>
                        <Button variant="destructive" size="sm" onClick={releaseSeats} disabled={loading}>
                            Release Seats
                        </Button>
                    </div>
                </div>
            )}

            <div className="bg-white p-8 rounded-lg border shadow-sm">
                <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
                <div className="flex justify-between text-gray-500 mb-8 border-b pb-4">
                    <span>📍 {event.location}</span>
                    <span>🎟️ {event.availableSeats} remaining</span>
                    <span>💲 ${event.price}</span>
                </div>

                {/* Only show booking form if NO pending order exists */}
                {!pendingOrder ? (
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
                ) : (
                    <div className="text-center p-4 bg-gray-50 rounded text-gray-500 text-sm">
                        <em>Please resolve your pending reservation above to book new tickets.</em>
                    </div>
                )}
            </div>
        </div>
    );
}