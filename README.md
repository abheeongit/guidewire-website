# Valor Shield

## Overview
Valor Shield is a parametric micro-insurance product for gig delivery workers.

The idea is simple: workers pay a weekly premium, and payouts are triggered when verified external disruptions (for example heavy rain, pollution spikes, or city restrictions) reduce their ability to work.

## Problem
Delivery workers can lose a meaningful part of daily income because of conditions they cannot control.

Most existing insurance products are not designed for this type of short-cycle, disruption-driven income risk.

## Solution
Valor Shield combines disruption monitoring with claim validation and automated payouts.

Core flow:
- Worker selects a weekly plan
- System monitors disruption signals in the active region
- Risk and legitimacy checks run continuously
- Eligible claims are processed with minimal manual intervention

## Key Features
- Hyper-local risk map
- Dynamic premium logic
- Predictive disruption alerts
- Fraud detection and claim validation
- Income stability dashboard
- Automatic parametric claim processing

## BRAN Engine
BRAN is the decision layer used for:
- Risk scoring
- Fraud detection
- Activity validation
- Payout recommendation

## Weekly Plans

| Plan | Premium | Coverage |
|------|--------|----------|
| Basic | ₹20 | ₹200 |
| Premium | ₹35 | ₹350 |
| Elite | ₹50 | ₹500 |

## Tech Stack
Frontend: React  
Backend: FastAPI  
AI/ML: Python (Scikit-learn, Pandas, NumPy)  
Database: PostgreSQL  
External APIs: Weather, AQI, Traffic  
Payments: Wallet / Razorpay (Test Mode)

## Workflow
User -> Select Plan -> Monitoring -> Disruption Detected -> AI Validation -> Payout

## What Is Different
Valor Shield uses parametric triggers, but does not rely on triggers alone.

A second validation layer checks worker activity and fraud signals before payout decisions.

## Adversarial Defense & Anti-Spoofing Strategy

### 1) The Differentiation
The system does not make decisions from GPS alone.

Each claim is evaluated on three tracks:
- Disruption truth: whether external conditions in that region and time window were actually severe
- Work continuity: expected vs actual work pattern for that worker profile and shift
- Trust integrity: whether device/session behavior is consistent with normal usage

When these tracks align, claims can be auto-approved. When they conflict, claims are routed to review instead of immediate denial.

### 2) The Data
To detect organized spoofing and collusion, the model uses signals beyond location coordinates:
- Route quality and movement plausibility (teleport jumps, impossible speed changes)
- Sensor consistency (heading/accelerometer vs movement claims)
- Geofence context (pickup/drop clusters, no-service zones, timestamp alignment)
- Network patterns (IP/ASN switching, VPN/proxy behavior during claim windows)
- Device integrity (device continuity, emulator/root/jailbreak indicators)
- Worker baseline behavior (shift rhythm, zone transitions, completion variance)
- Ring-level graph links (shared devices, shared network signatures, synchronized claim timing)

These features are scored with anomaly detection and supervised models, with thresholding tuned for explainability.

### 3) The UX Balance
The claim flow is designed to reduce fraud without punishing legitimate workers facing poor connectivity:
- Soft-flagging: suspicious claims are marked for review, not auto-rejected
- Grace windows: temporary signal drops in severe weather are retried before escalation
- Low-friction follow-up: additional checks are requested only when confidence is low
- Manual review for edge cases: reviewers see model reasons before decisions
- Recovery path: if later telemetry supports legitimacy, payout can be released automatically

This keeps the process fair for honest workers while still resisting coordinated abuse.
