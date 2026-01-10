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

    useEffect(() => {
        if (id) apiRequest(`/events/${id}`).then(setEvent).catch(console.error);
    }, [id]);

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

    if (!event) return null;

    return (
        <div className="bg-white p-8 rounded-lg border shadow-sm max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
            <div className="flex justify-between text-gray-500 mb-8 border-b pb-4">
                <span>📍 {event.location}</span>
                <span>🎟️ {event.availableSeats} remaining</span>
            </div>

            <div className="flex items-end gap-4">
                <div className="w-24">
                    <label className="text-xs font-semibold uppercase text-gray-500">Seats</label>
                    <Input type="number" min={1} max={4} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                </div>
                <Button onClick={book} disabled={loading} className="flex-1" size="lg">
                    {loading ? "Processing..." : `Confirm Booking ($${event.price * qty})`}
                </Button>
            </div>
        </div>
    );
}