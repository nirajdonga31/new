"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Orders() {
    // Mock data until you implement GET /api/orders
    const [orders, setOrders] = useState<any[]>([]);

    const cancel = async (orderId: string) => {
        if (!confirm("Release seat?")) return;
        try {
            await apiRequest(`/orders/${orderId}/cancel`, { method: "POST" });
            alert("Cancelled");
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Your Reservations</h1>

            {/* Sample UI for a pending order */}
            <Card className="border-l-4 border-l-yellow-400">
                <CardContent className="pt-6 flex justify-between items-center">
                    <div>
                        <p className="font-semibold text-lg">Pending Payment</p>
                        <p className="text-sm text-gray-500">Session expires in 10m</p>
                    </div>
                    <Button variant="destructive" onClick={() => cancel("ORDER_ID")}>Cancel</Button>
                </CardContent>
            </Card>
        </div>
    );
}