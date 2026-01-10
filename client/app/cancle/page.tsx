import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CancelPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Payment Cancelled</h1>
            <p className="text-gray-600 mb-8 max-w-md">
                Your payment was not processed and your reservation has been released.
                You can try booking again if you change your mind.
            </p>
            <Link href="/">
                <Button size="lg">Return to Events</Button>
            </Link>
        </div>
    );
}