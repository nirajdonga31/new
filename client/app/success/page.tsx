"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react"; // npm install lucide-react if missing, or remove icon

export default function SuccessPage() {
    return (
        <div className="flex justify-center mt-20">
            <Card className="w-full max-w-md text-center border-green-200 bg-green-50">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        {/* Simple SVG Checkmark if you don't want lucide-react */}
                        <svg className="h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <CardTitle className="text-green-700">Payment Successful!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-600 mb-6">
                        Your tickets have been confirmed. You can view your reservation details in your orders page.
                    </p>
                    <div className="space-y-3">
                        <Link href="/orders">
                            <Button className="w-full bg-green-600 hover:bg-green-700">View My Ticket</Button>
                        </Link>
                        <Link href="/">
                            <Button variant="outline" className="w-full">Back to Events</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}