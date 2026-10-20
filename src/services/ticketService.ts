import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export type DeviceType = 'Desktop' | 'Server' | 'Network Switch' | 'Laptop' | 'Firewall / Router';
export type PriorityLevel = 'Low' | 'Medium' | 'Critical';
export type TicketStatus = 'Open' | 'In Progress' | 'Resolved';

export interface ServiceTicket {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhotoUrl?: string;
  deviceType: DeviceType;
  priority: PriorityLevel;
  siteLocation: string;
  issueDescription: string;
  status: TicketStatus;
  resolutionNotes?: string;
  lastResolutionNote?: string;
  lastUpdatedBy?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface CreateTicketInput {
  clientName: string;
  clientEmail: string;
  clientPhotoUrl?: string;
  deviceType: DeviceType;
  priority: PriorityLevel;
  siteLocation: string;
  issueDescription: string;
  clientId: string;
}

// Generate valid alphanumeric ID matching rules: ^[a-zA-Z0-9_\-]+$
function generateTicketId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `tkt-${timestamp}-${random}`;
}

export async function createTicket(input: CreateTicketInput): Promise<string> {
  const ticketId = generateTicketId();
  const path = `tickets/${ticketId}`;

  const now = new Date().toISOString();
  const ticketData: Omit<ServiceTicket, 'id'> = {
    clientId: input.clientId,
    clientName: input.clientName.trim(),
    clientEmail: input.clientEmail.trim(),
    ...(input.clientPhotoUrl ? { clientPhotoUrl: input.clientPhotoUrl } : {}),
    deviceType: input.deviceType,
    priority: input.priority,
    siteLocation: input.siteLocation.trim(),
    issueDescription: input.issueDescription.trim(),
    status: 'Open',
    createdAt: now
  };

  try {
    const docRef = doc(db, 'tickets', ticketId);
    await setDoc(docRef, ticketData);
    return ticketId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserTickets(
  clientId: string,
  onData: (tickets: ServiceTicket[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = 'tickets';
  const q = query(collection(db, path), where('clientId', '==', clientId));

  return onSnapshot(
    q,
    (snapshot) => {
      const tickets: ServiceTicket[] = [];
      snapshot.forEach((docSnap) => {
        tickets.push({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ServiceTicket, 'id'>)
        });
      });
      // Sort newest first
      tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(tickets);
    },
    (error) => {
      console.error('Subscription error for user tickets:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllTickets(
  onData: (tickets: ServiceTicket[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = 'tickets';
  const q = collection(db, path);

  return onSnapshot(
    q,
    (snapshot) => {
      const tickets: ServiceTicket[] = [];
      snapshot.forEach((docSnap) => {
        tickets.push({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ServiceTicket, 'id'>)
        });
      });
      // Sort newest first
      tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(tickets);
    },
    (error) => {
      console.error('Subscription error for tech all-tickets:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function updateTicketStatusAndNotes(
  ticketId: string,
  newStatus: TicketStatus,
  newNote: string,
  techName: string,
  existingNotes = ''
): Promise<void> {
  const path = `tickets/${ticketId}`;
  const now = new Date();
  const timestampStr = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const formattedLogEntry = `• [${timestampStr}] (${techName} -> ${newStatus}): ${newNote.trim()}`;
  const updatedResolutionNotes = existingNotes
    ? `${existingNotes}\n${formattedLogEntry}`
    : formattedLogEntry;

  const updates: Record<string, any> = {
    status: newStatus,
    resolutionNotes: updatedResolutionNotes.slice(-5000), // Enforce schema limit
    lastResolutionNote: newNote.trim().slice(0, 1000),
    lastUpdatedBy: techName.slice(0, 150),
    updatedAt: now.toISOString()
  };

  if (newStatus === 'Resolved') {
    updates.resolvedAt = now.toISOString();
  }

  try {
    const docRef = doc(db, 'tickets', ticketId);
    await updateDoc(docRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
