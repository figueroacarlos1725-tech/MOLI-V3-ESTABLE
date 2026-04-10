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
- **Maps**: Mapbox GL JS (Token: configured in .env as EXPO_PUBLIC_MAPBOX_TOKEN)
- **Payments**: MercadoPago, AstroPay
- **AI Chat**: OpenAI via Emergent LLM Key

## Core Features

### Authentication
- [x] Email/Password registration and login
- [x] Google Social Login (Emergent OAuth)
- [x] JWT token-based authentication
- [x] Role-based access (rider, driver, admin, dispatcher)

### Rider App
- [x] Home screen with map (Mapbox)
- [x] Location selection (pickup/dropoff)
- [x] Ride request creation
- [x] View driver bids
- [x] Accept bid and track ride
- [x] Chat with driver
- [ ] Rate completed rides
- [ ] Ride history
- [ ] Wallet and payments
- [x] Support chat (AI + human)

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
