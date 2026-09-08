import { create } from 'zustand';
import { apiService } from '../services/api';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface Bid {
  bid_id: string;
  driver_id: string;
  driver_name: string;
  driver_rating: number;
  vehicle_info: any;
  fare_amount: number;
  estimated_arrival: number;
  created_at: string;
}

export interface RideRequest {
  request_id: string;
  rider_id: string;
  pickup_location: Location;
  dropoff_location: Location;
  ride_type: string;
  vehicle_type: string;
  status: string;
  estimated_fare: number;
  estimated_distance: number;
  estimated_duration: number;
  bids: Bid[];
  created_at: string;
}

export interface Ride {
  ride_id: string;
  request_id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: Location;
  dropoff_location?: Location;
  status: string;
  fare: number;
  vehicle_type?: string;
  service_type?: string;
  payment_method?: string;
  accepted_at?: string;
  estimated_distance?: number;
  distance?: number;
  penalty_surcharge?: number;
  driver_earnings?: number;
  is_taximeter?: boolean;
  is_ticketera?: boolean;
  driver_info?: any;
  rider_info?: any;
  vehicle_info?: any;
  driver_location?: Location;
  created_at: string;
}

interface RideState {
  currentRequest: RideRequest | null;
  currentRide: Ride | null;
  bids: Bid[];
  rideHistory: Ride[];
  pendingRequests: RideRequest[];
  isLoading: boolean;
  
  createRideRequest: (data: any) => Promise<RideRequest>;
  fetchActiveRequest: () => Promise<RideRequest | null>;
  fetchActiveRide: () => Promise<Ride | null>;
  fetchRideHistory: () => Promise<void>;
  fetchPendingRequests: (lat: number, lng: number) => Promise<void>;
  submitBid: (requestId: string, fareAmount: number, estimatedArrival: number) => Promise<void>;
  acceptBid: (bidId: string) => Promise<void>;
  updateRideStatus: (
    rideId: string,
    status: string,
    extra?: { taximeter_fare?: number; taximeter_distance?: number; taximeter_wait?: number },
  ) => Promise<any>;
  rateRide: (rideId: string, rating: number, comment?: string) => Promise<void>;
  addBid: (bid: Bid) => void;
  setCurrentRide: (ride: Ride | null) => void;
  clearRequest: () => void;
}

export const useRideStore = create<RideState>((set, get) => ({
  currentRequest: null,
  currentRide: null,
  bids: [],
  rideHistory: [],
  pendingRequests: [],
  isLoading: false,

  createRideRequest: async (data) => {
    set({ isLoading: true });
    try {
      const response = await apiService.post('/rides/request', data);
      set({ currentRequest: response, bids: [], isLoading: false });
      return response;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  fetchActiveRequest: async () => {
    try {
      const response = await apiService.get('/rides/request/active');
      const request = (response.request ?? null) as RideRequest | null;
      set({ currentRequest: request });
      return request;
    } catch (error) {
      console.error('Error fetching active ride request:', error);
      return null;
    }
  },

  fetchActiveRide: async () => {
    try {
      const response = await apiService.get('/rides/active');
      const ride = (response.ride ?? null) as Ride | null;
      set({ currentRide: ride });
      return ride;
    } catch (error) {
      console.error('Error fetching active ride:', error);
      return null;
    }
  },

  fetchRideHistory: async () => {
    try {
      const response = await apiService.get('/rides?limit=50');
      set({ rideHistory: response.rides });
    } catch (error) {
      console.error('Error fetching ride history:', error);
    }
  },

  fetchPendingRequests: async (lat: number, lng: number) => {
    try {
      const response = await apiService.get(`/rides/requests/pending?latitude=${lat}&longitude=${lng}`);
      set({ pendingRequests: response.requests });
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  },

  submitBid: async (requestId, fareAmount, estimatedArrival) => {
    try {
      await apiService.post('/rides/bid', {
        request_id: requestId,
        fare_amount: fareAmount,
        estimated_arrival: estimatedArrival
      });
    } catch (error) {
      throw error;
    }
  },

  acceptBid: async (bidId) => {
    try {
      const response = await apiService.post(`/rides/accept-bid/${bidId}`);
      set({ currentRide: response.ride, currentRequest: null, bids: [] });
    } catch (error) {
      throw error;
    }
  },

  updateRideStatus: async (rideId, status, extra?: { taximeter_fare?: number; taximeter_distance?: number; taximeter_wait?: number }) => {
    try {
      let url = `/rides/${rideId}/status?status=${status}`;
      if (extra?.taximeter_fare) url += `&taximeter_fare=${extra.taximeter_fare}`;
      if (extra?.taximeter_distance) url += `&taximeter_distance=${extra.taximeter_distance}`;
      if (extra?.taximeter_wait) url += `&taximeter_wait=${extra.taximeter_wait}`;
      const response = await apiService.put(url);
      const currentRide = get().currentRide;
      if (currentRide && currentRide.ride_id === rideId) {
        set({ currentRide: { ...currentRide, status } });
      }
      return response;
    } catch (error) {
      throw error;
    }
  },

  rateRide: async (rideId, rating, comment) => {
    try {
      await apiService.post(`/rides/${rideId}/rate?rating=${rating}${comment ? `&comment=${comment}` : ''}`);
    } catch (error) {
      throw error;
    }
  },

  addBid: (bid) => {
    set((state) => ({ bids: [...state.bids, bid] }));
  },

  setCurrentRide: (ride) => {
    set({ currentRide: ride });
  },

  clearRequest: () => {
    set({ currentRequest: null, currentRide: null, bids: [] });
  },
}));
