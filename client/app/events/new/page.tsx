"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export default function CreateEventPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    // Form State
    const [form, setForm] = useState({
        name: "",
        price: "",
        location: "",
        seats: "",
        eventType: "fun" // Default value
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return router.push("/login");

        setLoading(true);
        try {
            await apiRequest("/events", {
                method: "POST",
                body: JSON.stringify({
                    name: form.name,
                    location: form.location,
                    eventType: form.eventType,
                    price: Number(form.price),
                    seats: Number(form.seats)
                })
            });
            router.push("/"); // Redirect to home on success
        } catch (err: any) {
            alert(err.message || "Failed to create event");
        } finally {
            setLoading(false);
        }
    };

    // If not logged in, show simple message (or useEffect redirect)
    if (!user) {
        return <div className="p-10 text-center">Please log in to create an event.</div>;
    }

    return (
        <div className="max-w-xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Event</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Event Name */}
                        <div>
                            <label className="text-sm font-medium">Event Name</label>
                            <Input
                                required
                                placeholder="e.g. Summer Music Festival"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>

                        {/* Location */}
                        <div>
                            <label className="text-sm font-medium">Location</label>
                            <Input
                                required
                                placeholder="e.g. Central Park, NY"
                                value={form.location}
                                onChange={(e) => setForm({ ...form, location: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Price */}
                            <div>
                                <label className="text-sm font-medium">Price ($)</label>
                                <Input
                                    required
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={form.price}
                                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                                />
                            </div>

                            {/* Seats */}
                            <div>
                                <label className="text-sm font-medium">Total Seats</label>
                                <Input
                                    required
                                    type="number"
                                    min="1"
                                    placeholder="100"
                                    value={form.seats}
                                    onChange={(e) => setForm({ ...form, seats: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Event Type (Simple Select) */}
                        <div>
                            <label className="text-sm font-medium block mb-2">Category</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={form.eventType}
                                onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                            >
                                <option value="fun">Fun & Social</option>
                                <option value="sports">Sports</option>
                                <option value="educational">Educational</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Creating..." : "Publish Event"}
                        </Button>

                    </form>
                </CardContent>
            </Card>
        </div>
    );
}