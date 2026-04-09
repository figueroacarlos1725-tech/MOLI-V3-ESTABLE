# TaxiRide Clone - Product Requirements Document

## Overview
A complete taxi booking application similar to Uber/Grab, featuring:
- Rider App (passenger booking)
- Driver App (accepting rides, navigation)
- Admin Panel (management, configuration)
- AI-powered support chat with human dispatcher fallback

## Technology Stack
- **Frontend**: Expo React Native (cross-platform mobile)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Real-time**: WebSockets
- **Maps**: OpenStreetMap (default), Google Maps/Mapbox (optional)
- **Payments**: MercadoPago, AstroPay
- **AI Chat**: OpenAI via Emergent LLM Key

## Core Features

### Authentication
- [x] Email/Password registration and login
- [x] Google Social Login (Emergent OAuth)
- [x] JWT token-based authentication
- [x] Role-based access (rider, driver, admin, dispatcher)

### Rider App
- [ ] Home screen with map
- [ ] Location selection (pickup/dropoff)
- [ ] Ride request creation
- [ ] View driver bids
- [ ] Accept bid and track ride
- [ ] Chat with driver
- [ ] Rate completed rides
- [ ] Ride history
- [ ] Wallet and payments
- [ ] Support chat (AI + human)

### Driver App
- [ ] Online/offline toggle
- [ ] View nearby ride requests
- [ ] Submit bids
- [ ] Accept rides and navigate
- [ ] Update ride status
- [ ] Earnings dashboard
- [ ] Vehicle management

### Admin Panel
- [ ] Dashboard with statistics
- [ ] User management
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
