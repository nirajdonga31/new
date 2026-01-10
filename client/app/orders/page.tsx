"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Order {
    id: string;
    eventId: string;
    quantity: number;
    amount: number;
    status: 'pending' | 'confirmed' | 'paid' | 'expired' | 'failed';
    createdAt: any;
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            const res = await apiRequest("/orders");
            setOrders(res.orders || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const cancelOrder = async (orderId: string) => {
        if (!confirm("Are you sure you want to cancel this reservation?")) return;
        try {
            await apiRequest(`/orders/${orderId}/cancel`, { method: "POST" });
            fetchOrders(); // Refresh list
        } catch (err: any) {
            alert(err.message || "Failed to cancel");
        }
    };

    if (loading) return <div className="p-10 text-center">Loading orders...</div>;

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
                <p className="mb-4">You haven't booked any events yet.</p>
                <Link href="/">
                    <Button>Browse Events</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold mb-6">My Reservations</h1>

            {orders.map((order) => (
                <Card key={order.id} className={`border-l-4 ${order.status === 'paid' || order.status === 'confirmed' ? 'border-l-green-500' :
                    order.status === 'pending' ? 'border-l-yellow-400' : 'border-l-gray-300'
                    }`}>
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg">
                                Order #{order.id.slice(0, 8)}
                            </CardTitle>
                            <Badge variant={order.status === 'pending' ? "outline" : "default"} className="uppercase">
                                {order.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between items-end">
                            <div className="text-sm text-gray-600 space-y-1">
                                <p><strong>Tickets:</strong> {order.quantity}</p>
                                <p><strong>Total:</strong> ${order.amount}</p>
                                <p className="text-xs text-gray-400">
                                    {new Date(order.createdAt._seconds * 1000).toLocaleDateString()}
                                </p>
                            </div>

                            {order.status === 'pending' && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => cancelOrder(order.id)}
                                >
                                    Cancel Reservation
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}