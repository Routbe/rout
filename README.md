<div align="center">

# Rout

**The Sovereign, High-Resolution QR Code & Alias Infrastructure**

[![Website](https://img.shields.io/badge/Production-rout.be-0B0B0C?style=for-the-badge&logo=googlechrome&logoColor=white)](https://rout.be)
[![License](https://img.shields.io/badge/License-MIT-0B0B0C?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-0B0B0C?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase_RLS-0B0B0C?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![WebAuthn](https://img.shields.io/badge/Auth-WebAuthn_Passkeys-0B0B0C?style=for-the-badge&logo=fido&logoColor=white)](https://fidoalliance.org)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind_v3-0B0B0C?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

[Live Platform](https://rout.be) • [R&D Lab](https://lab.rout.be) • [Asset CDN](https://assets.rout.be) • [Report Vulnerability](#security--data-sovereignty)

</div>

---

## Table of Contents

- [Philosophy](#philosophy)
- [Feature Comparison](#feature-comparison)
- [System Architecture](#system-architecture)
- [Core Subsystems](#core-subsystems)
  - [Multi-Layer Vector Engine](#1-multi-layer-vector-engine)
  - [WebAuthn & Passkey Authentication](#2-webauthn--passkey-authentication)
  - [Inbound Email Payment Webhooks](#3-inbound-email-payment-webhooks)
- [Subdomain Topology](#subdomain-topology)
- [Database Schema & RLS Security](#database-schema--rls-security)
- [Directory Structure](#directory-structure)
- [Environment Configuration](#environment-configuration)
- [Local Development Setup](#local-development-setup)
- [API & Webhook Contracts](#api--webhook-contracts)
- [Roadmap](#roadmap)
- [Security & Data Sovereignty](#security--data-sovereignty)
- [License](#license)

---

## Philosophy

Most commercial QR generators are bloatware: they inject heavy redirection tracking scripts, enforce aggressive paywalls on simple vector exports, and compromise user privacy.

**Rout** is engineered as sovereign web infrastructure:
* **Zero Tracking Wrappers:** Direct vector generation with client-side canvas and SVG rendering.
* **Obsidian Design System:** Custom dark-mode UI (`#0B0B0C`) built for clarity and speed.
* **Hardware-Grade Auth:** Passwordless authentication via WebAuthn/Passkeys, cutting dependency on brittle third-party identity providers.
* **Data Sovereignty:** Tight PostgreSQL Row Level Security (RLS) enforcement to ensure user data remains exclusively accessible by its owner.

---

## Feature Comparison

| Capability | Standard QR Generators | Rout (`rout.be`) |
| :--- | :--- | :--- |
| **Vector Exporting** | Behind paywalls / Raster PNGs only | Lossless SVG, High-DPI PNG, & PDF |
| **Layered Customization** | Single color fill & basic logo overlay | Independent control over modules, frames, dots & quiet zones |
| **Authentication** | Passwords / Third-party cookies | Hardware Passkeys (WebAuthn) + Passwordless OTP |
| **Redirect Latency** | High (500ms+ tracking hops) | Sub-second direct edge resolution |
| **Data Privacy** | PII harvested & sold to ad networks | Sovereign PostgreSQL RLS isolation |
| **Payment Verification** | Manual review or proprietary portals | Automated Inbound Email Webhook Parsing (Wise) |

---

## System Architecture

```text
                               ┌─────────────────────────┐
                               │     Client Browser      │
                               │  (React 18 / Vite SPA)  │
                               └────────────┬────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │ HTTPS / WebAuthn API       │ Client-side Rendering      │ Direct Storage Requests
               ▼                            ▼                            ▼
  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
  │ Supabase Auth Service  │  │ Vector QR Layer Engine │  │   Swiss Asset CDN      │
  │  (Passkeys / Resend)   │  │  (qr-code-styling)     │  │   (assets.rout.be)     │
  └────────────┬───────────┘  └────────────────────────┘  └────────────────────────┘
               │
               ▼
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                           Supabase Infrastructure                               │
  │                                                                                 │
  │  ┌─────────────────────────────────┐       ┌─────────────────────────────────┐  │
  │  │ PostgreSQL DB (Hardened RLS)    │       │ Deno Edge Functions             │  │
  │  │ - profiles     - challenges     │───────│ - inbound-payment-email       │  │
  │  │ - routes       - payment_logs   │       │ - cron-audit-security           │  │
  │  └─────────────────────────────────┘       └─────────────────────────────────┘  │
  └─────────────────────────────────────────┬───────────────────────────────────────┘
                                            │
                                            ▼ Webhook Listener
                               ┌─────────────────────────┐
                               │  Inbound Mail Parsing   │
                               │  (ImprovMX / Wise API)  │
                               └─────────────────────────┘

Core Subsystems
1. Multi-Layer Vector Engine
Rout divides QR generation into isolated render passes:
 * Data Layer: High-density module encoding with configurable error correction levels (L, M, Q, H).
 * Frame Layer: Customizable outer corner geometries (rounded, sharp, obsidian-cut).
 * Dot Layer: Independent inner corner eye styling.
 * Brand Inset: Lossless SVG vector scaling within safety-calculated quiet zones to prevent scan failure.
2. WebAuthn & Passkey Authentication
Hardware-backed credential management using @simplewebauthn/browser and @simplewebauthn/server:
 * Biometric/hardware key registration stored in the passkeys table.
 * Cryptographic challenge verification handled strictly via server-side Edge Functions.
 * Automatic fallback to passwordless Resend Magic Links when WebAuthn is unsupported.
3. Inbound Email Payment Webhooks
Automated financial reconciliation for dynamic route reservations:
 * Bank transfer confirmation sent via email (e.g., Wise transaction notifications).
 * Email captured by ImprovMX / Cloudflare Worker and forwarded as an HTTP POST payload.
 * Edge Function inbound-payment-email validates INBOUND_EMAIL_TOKEN and checks sender DKIM/SPF signatures.
 * Regex parses transaction amount and unique reference key (ROUT-XXXXXX).
 * Database atomically marks reservation status as completed.
Subdomain Topology
| Domain | Purpose | Tech Stack |
|---|---|---|
| rout.be | Primary production app & routing service | React 18, Vite, Supabase, Tailwind |
| lab.rout.be | R&D sandbox for 3D/WebGPU & WebGL QR experiments | Three.js, React Three Fiber |
| assets.rout.be | Swiss-hosted static media CDN (Fonts, Press Kits, SVGs) | Infomaniak Storage (CORS Enabled) |
| docs.rout.be | Developer documentation & API references | Starlight / VitePress |
Database Schema & RLS Security
Data isolation is managed via PostgreSQL Row Level Security policies:
-- Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routes / QR Table
CREATE TABLE public.routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  destination_url TEXT NOT NULL,
  qr_config JSONB DEFAULT '{}'::jsonb NOT NULL,
  scan_count BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Enforcement
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Route Policies
CREATE POLICY "Public routes are viewable by everyone" 
  ON public.routes FOR SELECT USING (true);

CREATE POLICY "Users can manage their own routes" 
  ON public.routes FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

Directory Structure
routbe/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD deployment pipeline
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── assets/                     # System SVGs, logos, static branding
│   ├── components/
│   │   ├── auth/                   # WebAuthn passkey modals & OTP inputs
│   │   ├── dashboard/              # Analytics, link management tables
│   │   ├── qr/                     # Canvas renderer, vector controls, color pickers
│   │   └── ui/                     # Design system (Buttons, Dialogs, Inputs)
│   ├── hooks/                      # Custom hooks (useAuth, usePasskeys, useQRGenerator)
│   ├── lib/                        # Supabase client, WebAuthn helpers, utility functions
│   ├── pages/                      # Application views (Home, Dashboard, Settings, Auth)
│   ├── services/                   # API wrappers and client RPC handlers
│   ├── types/                      # Global TypeScript interface declarations
│   ├── App.tsx                     # Main application routing and context providers
│   └── main.tsx                    # React DOM entry point
├── supabase/
│   ├── functions/
│   │   ├── inbound-payment-email/  # Wise payment parsing webhook
│   │   └── verify-passkey/         # Server-side WebAuthn challenge verification
│   └── migrations/                 # PostgreSQL schema migrations and security patches
├── .env.example                    # Template environment variables
├── package.json                    # Package manifest
├── tailwind.config.js              # Theme definitions (Obsidian palette)
├── tsconfig.json                   # TypeScript compiler configuration
└── vite.config.ts                  # Vite build options

Environment Configuration
Create a .env.local file in the root directory:
| Variable | Scope | Description |
|---|---|---|
| VITE_SUPABASE_URL | Public / Client | Supabase project endpoint URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Public / Client | Supabase anonymous client API key |
| SUPABASE_SERVICE_ROLE_KEY | Server / Edge | Elevated administrative database access key |
| INBOUND_EMAIL_TOKEN | Server / Edge | Secret token validating incoming mail webhooks |
| RESEND_API_KEY | Server / Edge | Transactional email provider key |
| STRIPE_SECRET_KEY | Server / Edge | Optional payment gateway secret |
| IMPROVMX_API_KEY | Server / Edge | Email alias & webhook forwarding management key |
| PUBLIC_SITE_URL | Client / Server | Canonical public URL (https://rout.be) |
Local Development Setup
Prerequisites
 * Node.js: v18.0.0 or higher
 * npm: v9.0.0 or higher
 * Supabase CLI: Optional (for local database migrations)
Step-by-Step Installation
 * Clone the repository:
   git clone [https://github.com/jdelplanche/routbe-43f6ee75.git](https://github.com/jdelplanche/routbe-43f6ee75.git)
cd routbe-43f6ee75

 * Install dependencies:
   npm install

 * Configure environment variables:
   cp .env.example .env.local
# Populate .env.local with your Supabase credentials

 * Launch local development server:
   npm run dev

   Navigate to http://localhost:5173 in your browser.
 * Execute test suite:
   npm run test

API & Webhook Contracts
Inbound Payment Webhook
POST /functions/v1/inbound-payment-email
Headers
Content-Type: application/json
X-Inbound-Token: <YOUR_INBOUND_EMAIL_TOKEN>

Request Payload
{
  "from": "noreply@wise.com",
  "to": "pay@rout.be",
  "subject": "You received 15.00 EUR from John Doe",
  "body_plain": "Payment received with reference ROUT-8F92A1 for amount 15.00 EUR."
}

Expected Responses
 * 200 OK: Transaction parsed and matched to pending reservation.
 * 401 Unauthorized: Invalid or missing X-Inbound-Token.
 * 422 Unprocessable Entity: Mail payload did not contain a valid payment reference or amount.
Roadmap
 * [x] Multi-layer vector QR customization engine (SVG/PDF export)
 * [x] WebAuthn Passkey authentication integration
 * [x] Hardened Row Level Security (RLS) on PostgreSQL database
 * [x] Automated Wise inbound email payment reconciliation
 * [ ] Launch lab.rout.be for WebGPU/3D interactive QR experiences
 * [ ] Developer API keys & public SDK release
 * [ ] Offline-first PWA mode for event organizers
Security & Data Sovereignty
Data sovereignty is fundamental to Rout. Client-side cryptographic operations ensure sensitive assets remain isolated.
 * No Plaintext Credential Storage: Authentication relies strictly on FIDO2/WebAuthn public key cryptography or short-lived magic links.
 * RLS Isolation: Database tables deny client requests by default unless explicitly permitted by targeted policy rules.
 * Vulnerability Reporting: If you discover a security issue, please do not open a public issue. Submit a confidential disclosure via GitHub Security Advisories or contact maintainers directly.
License
Distributed under the MIT License. See LICENSE for complete details.
