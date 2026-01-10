"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext"; // Import Auth

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const { user } = useAuth(); // Get current user

  useEffect(() => {
    apiRequest("/events").then((res) => setEvents(res.events || [])).catch(console.error);
  }, []);

  return (
    <div>
      {/* Header Section with Create Button */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Upcoming Events</h1>
        {user && (
          <Link href="/events/new">
            <Button>+ Create Event</Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <Card key={e.id} className="hover:shadow-md transition">
            <CardHeader>
              <CardTitle className="text-lg">{e.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm mb-4">{e.location} • ${e.price}</p>
              <Link href={`/events/${e.id}`}>
                <Button className="w-full" variant="outline">View Event</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}