# TaxiRide Clone "Molí" - Product Requirements Document

## Overview
A complete taxi booking application (Molí - Movete libre), featuring:
- Rider App (passenger booking with Cabify-style UI)
- Driver App (automatic dispatch with 8s countdown popup)
- Admin Panel (management, configuration)
- AI-powered support chat with human dispatcher fallback

## Technology Stack
- **Frontend**: Expo React Native (cross-platform mobile)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Real-time**: WebSockets (FastAPI native)
- **Maps**: Google Maps (API Key configured, with OSM fallback)
- **Payments**: MercadoPago, AstroPay (pending API keys)
- **AI Chat**: OpenAI via Emergent LLM Key

## Core Features

### Authentication
- [x] Email/Password registration and login
- [x] Google Social Login (Emergent OAuth)
- [x] JWT token-based authentication
- [x] Role-based access (rider, driver, admin, dispatcher)

### Rider App
- [x] Home screen with Google Maps (Catamarca default)
- [x] Auto-detect location & draggable markers
- [x] Google Places Autocomplete for destination search
- [x] Real-time fare pricing based on route distance
- [x] Vertical vehicle list view (when route available)
- [x] Horizontal vehicle cards (compact, before route)
- [x] Ride request with automatic dispatch
- [x] Dispatch progress modal (searching/accepted/no_drivers)
- [x] WebSocket listeners for real-time dispatch updates
- [x] Active ride tracking with driver info
- [x] Chat with driver
- [x] Molí+ banner and promotional ads
- [x] Support chat (AI + human)
- [ ] Rate completed rides
- [ ] Wallet and payments

### Driver App
- [x] Online/offline toggle with inline confirmation
- [x] Automatic ride dispatch (8s countdown popup)
- [x] Sound alert and vibration on ride offer
- [x] Accept/Reject ride offers
- [x] Active ride view with navigation
- [x] Real-time location updates via WebSocket
- [x] Earnings dashboard
- [x] Vehicle management

### Automatic Dispatch System (Uber-style)
- [x] Backend: Background task offers ride to closest driver first
- [x] Backend: 8-second timeout per driver, moves to next
- [x] Backend: POST /api/rides/{request_id}/driver-response endpoint
- [x] Frontend Driver: Popup with countdown timer, fare, distances
- [x] Frontend Driver: Sound (expo-av) and vibration alerts
- [x] Frontend Rider: Real-time status updates via WebSocket
- [x] Frontend Rider: "Buscando conductor" modal with progress

### Admin Panel
- [x] User management (CRUD)
- [x] Balance and debt management
- [x] Fare configuration per vehicle type
- [x] Coupon management
- [x] Commission management
- [x] Driver block/unblock
- [x] Payment configuration
- [x] Audit log
- [ ] Driver verification
- [ ] Ride monitoring
- [ ] Settings (API keys, rates)
- [ ] Coupon management
- [ ] Dispatcher chat center

## API Endpoints
All implemented in /app/backend/server.py

## Status
- Backend: Complete
- Frontend: In Progress
