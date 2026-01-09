export interface Event {
    id?: string;
    name: string;
    price: number;
    location: string;
    eventType: 'fun' | 'sports' | 'educational' | 'other';
    seats: number;
    availableSeats: number;
    createdBy: string;
    createdAt: Date;
    attendees?: string[];
}